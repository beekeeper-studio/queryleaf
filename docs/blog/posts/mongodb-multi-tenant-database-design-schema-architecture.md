---
title: "MongoDB Multi-Tenant Database Design and Schema Architecture: Advanced Patterns for Scalable SaaS Applications"
description: "Master MongoDB multi-tenant database design patterns and schema architecture strategies. Learn advanced tenant isolation, data partitioning, and SQL-familiar multi-tenancy operations for scalable SaaS applications."
date: 2025-12-17
tags: [mongodb, multi-tenant, database-design, schema-architecture, saas, scalability, sql]
---

# MongoDB Multi-Tenant Database Design and Schema Architecture: Advanced Patterns for Scalable SaaS Applications

Modern Software-as-a-Service (SaaS) applications serve multiple customers (tenants) through a single application instance, requiring sophisticated database design strategies that ensure data isolation, optimal performance, and cost-effective scalability. Traditional single-tenant database architectures become prohibitively expensive and operationally complex when supporting hundreds or thousands of customers, necessitating multi-tenant approaches that balance isolation, performance, and resource utilization.

MongoDB provides powerful multi-tenant database design capabilities that enable applications to efficiently serve multiple tenants through flexible schema architecture, advanced data partitioning strategies, and comprehensive isolation mechanisms. Unlike traditional relational databases that require complex sharding logic or expensive per-tenant database provisioning, MongoDB's document-oriented architecture naturally supports multi-tenant patterns with built-in scalability, flexible schemas, and sophisticated access control.

## The Single-Tenant Architecture Challenge

Traditional single-tenant database approaches face significant scalability and cost challenges in SaaS environments:

```sql
-- Traditional single-tenant approach - separate database per tenant (expensive and complex)

-- Tenant 1 Database
CREATE DATABASE tenant_1_app_db;
USE tenant_1_app_db;

CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    subscription_plan VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Single-tenant specific fields
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'tenant_1',
    tenant_config JSON,
    custom_fields JSON
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id),
    order_total DECIMAL(10,2) NOT NULL,
    order_status VARCHAR(50) NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Tenant-specific customizations
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'tenant_1',
    tenant_workflow_stage VARCHAR(100),
    custom_order_fields JSON
);

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) UNIQUE NOT NULL,
    product_price DECIMAL(10,2) NOT NULL,
    inventory_count INTEGER DEFAULT 0,
    
    -- Tenant-specific product data
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'tenant_1',
    tenant_product_categories TEXT[],
    custom_product_fields JSON
);

-- Tenant 2 Database (identical structure - resource duplication)
CREATE DATABASE tenant_2_app_db;
USE tenant_2_app_db;

-- Duplicate all table definitions with different tenant_id defaults
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    subscription_plan VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'tenant_2',
    tenant_config JSON,
    custom_fields JSON
);

-- ... repeat for orders, products, etc.

-- Problems with single-tenant database approach:
-- 1. Massive resource duplication - each tenant needs full database infrastructure
-- 2. Complex backup and maintenance operations across hundreds of databases
-- 3. Inefficient resource utilization - small tenants waste allocated resources
-- 4. Expensive database licensing and infrastructure costs
-- 5. Difficult cross-tenant analytics and reporting
-- 6. Complex application deployment and configuration management
-- 7. Challenging schema evolution across multiple databases
-- 8. Poor resource sharing and peak load distribution
-- 9. Complex monitoring and performance optimization
-- 10. Difficult disaster recovery and data migration scenarios

-- Example of complex connection management for single-tenant approach
-- Application code must maintain separate connections per tenant

-- PostgreSQL connection configuration for single-tenant (complex management)
CREATE ROLE tenant_1_user WITH LOGIN PASSWORD 'secure_password_1';
GRANT ALL PRIVILEGES ON DATABASE tenant_1_app_db TO tenant_1_user;

CREATE ROLE tenant_2_user WITH LOGIN PASSWORD 'secure_password_2';
GRANT ALL PRIVILEGES ON DATABASE tenant_2_app_db TO tenant_2_user;

-- Application must manage multiple connection pools
-- Connection Pool Configuration (simplified example):
-- tenant_1_pool: max_connections=20, database=tenant_1_app_db, user=tenant_1_user
-- tenant_2_pool: max_connections=20, database=tenant_2_app_db, user=tenant_2_user
-- tenant_n_pool: max_connections=20, database=tenant_n_app_db, user=tenant_n_user

-- Query execution requires tenant-specific connection routing
SELECT c.company_name, COUNT(o.order_id) as order_count
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.company_name;

-- This query must be executed separately for each tenant database:
-- - Connect to tenant_1_app_db and execute query
-- - Connect to tenant_2_app_db and execute query  
-- - Connect to tenant_n_app_db and execute query
-- - Aggregate results at application level (complex)

-- Schema evolution challenges in single-tenant approach
-- Adding a new field requires coordinated deployment across all tenant databases

-- Add new field to customers table (must be done for EVERY tenant database)
ALTER TABLE customers ADD COLUMN subscription_renewal_date DATE;
ALTER TABLE customers ADD COLUMN billing_cycle VARCHAR(20) DEFAULT 'monthly';

-- Must be executed for:
-- tenant_1_app_db.customers
-- tenant_2_app_db.customers  
-- tenant_3_app_db.customers
-- ... tenant_n_app_db.customers

-- Backup and recovery complexity
-- Individual backup strategies per tenant database
pg_dump tenant_1_app_db > tenant_1_backup_2025_12_17.sql
pg_dump tenant_2_app_db > tenant_2_backup_2025_12_17.sql
pg_dump tenant_3_app_db > tenant_3_backup_2025_12_17.sql
-- ... repeat for all tenant databases

-- Cross-tenant reporting challenges (requires complex federation)
-- Attempting to get aggregate statistics across all tenants
WITH tenant_1_data AS (
    SELECT 'tenant_1' as tenant_id, COUNT(*) as customer_count, SUM(order_total) as revenue
    FROM tenant_1_app_db.customers c
    LEFT JOIN tenant_1_app_db.orders o ON c.customer_id = o.customer_id
),
tenant_2_data AS (
    SELECT 'tenant_2' as tenant_id, COUNT(*) as customer_count, SUM(order_total) as revenue
    FROM tenant_2_app_db.customers c
    LEFT JOIN tenant_2_app_db.orders o ON c.customer_id = o.customer_id
)
-- This approach becomes impossible with many tenants and requires complex application-level aggregation

-- Single-tenant limitations:
-- 1. Prohibitive infrastructure costs for large numbers of tenants
-- 2. Complex operational overhead for database maintenance
-- 3. Poor resource utilization and sharing inefficiencies
-- 4. Difficult cross-tenant feature development and analytics
-- 5. Complex disaster recovery and business continuity planning
-- 6. Challenging performance monitoring and optimization across databases
-- 7. Inefficient development and testing environment management
-- 8. Complex compliance and audit trail management
-- 9. Difficult tenant onboarding and offboarding processes
-- 10. Poor scalability characteristics for SaaS growth patterns
```

MongoDB provides sophisticated multi-tenant database design patterns:

```javascript
// MongoDB Advanced Multi-Tenant Database Design and Schema Architecture

const { MongoClient, ObjectId } = require('mongodb');

// Comprehensive Multi-Tenant Database Architecture Manager
class MongoDBMultiTenantManager {
  constructor(connectionString, config = {}) {
    this.client = new MongoClient(connectionString);
    this.db = null;
    
    // Multi-tenant configuration strategies
    this.tenantStrategy = config.tenantStrategy || 'shared_database_shared_collection'; // Options: shared_database_shared_collection, shared_database_separate_collections, separate_databases
    this.tenantIsolationLevel = config.tenantIsolationLevel || 'logical'; // Options: logical, physical, hybrid
    this.enableTenantSharding = config.enableTenantSharding || false;
    this.enableTenantReplication = config.enableTenantReplication || false;
    
    // Advanced multi-tenant features
    this.config = {
      // Tenant identification and routing
      tenantIdentification: {
        strategy: config.tenantIdStrategy || 'header', // header, subdomain, path, database
        fieldName: config.tenantIdField || 'tenant_id',
        enableTenantCaching: config.enableTenantCaching !== false,
        cacheExpiration: config.cacheExpiration || 300000 // 5 minutes
      },
      
      // Data isolation and security
      dataIsolation: {
        enableRowLevelSecurity: config.enableRowLevelSecurity !== false,
        enableEncryptionAtRest: config.enableEncryptionAtRest || false,
        enableFieldLevelEncryption: config.enableFieldLevelEncryption || false,
        enableAuditLogging: config.enableAuditLogging !== false
      },
      
      // Performance and scalability
      performance: {
        enableTenantIndexing: config.enableTenantIndexing !== false,
        enableQueryOptimization: config.enableQueryOptimization !== false,
        enableCaching: config.enableCaching !== false,
        enableConnectionPooling: config.enableConnectionPooling !== false
      },
      
      // Schema management and evolution
      schemaManagement: {
        enableFlexibleSchemas: config.enableFlexibleSchemas !== false,
        enableSchemaVersioning: config.enableSchemaVersioning || false,
        enableCustomFields: config.enableCustomFields !== false,
        enableTenantSpecificCollections: config.enableTenantSpecificCollections || false
      },
      
      // Resource management
      resourceManagement: {
        enableResourceQuotas: config.enableResourceQuotas || false,
        enableTenantMetrics: config.enableTenantMetrics !== false,
        enableAutoScaling: config.enableAutoScaling || false,
        enableLoadBalancing: config.enableLoadBalancing || false
      }
    };
    
    this.tenantRegistry = new Map();
    this.tenantMetrics = new Map();
    this.initializeMultiTenantArchitecture();
  }

  async initializeMultiTenantArchitecture() {
    console.log('Initializing MongoDB multi-tenant architecture...');
    
    try {
      await this.client.connect();
      this.db = this.client.db('multi_tenant_saas_platform');
      
      // Setup tenant registry and metadata management
      await this.setupTenantRegistry();
      
      // Configure multi-tenant collections and indexes
      await this.setupMultiTenantCollections();
      
      // Initialize tenant-aware security and access control
      await this.setupTenantSecurity();
      
      // Setup performance monitoring and optimization
      await this.setupTenantPerformanceMonitoring();
      
      console.log('Multi-tenant architecture initialized successfully');
      
    } catch (error) {
      console.error('Error initializing multi-tenant architecture:', error);
      throw error;
    }
  }

  async setupTenantRegistry() {
    console.log('Setting up tenant registry and metadata management...');
    
    const tenantRegistry = this.db.collection('tenant_registry');
    
    // Create indexes for efficient tenant lookup and management
    await tenantRegistry.createIndex({ tenant_id: 1 }, { unique: true });
    await tenantRegistry.createIndex({ subdomain: 1 }, { unique: true, sparse: true });
    await tenantRegistry.createIndex({ status: 1, created_at: -1 });
    await tenantRegistry.createIndex({ subscription_plan: 1, tenant_tier: 1 });
    
    // Setup tenant metadata collection for configuration and customization
    const tenantMetadata = this.db.collection('tenant_metadata');
    await tenantMetadata.createIndex({ tenant_id: 1, metadata_type: 1 }, { unique: true });
    await tenantMetadata.createIndex({ tenant_id: 1, updated_at: -1 });
  }

  async setupMultiTenantCollections() {
    console.log('Setting up multi-tenant collections and schema architecture...');
    
    // Setup shared collections with tenant isolation
    const collections = ['customers', 'orders', 'products', 'invoices', 'users', 'analytics_events'];
    
    for (const collectionName of collections) {
      const collection = this.db.collection(collectionName);
      
      // Create tenant-aware indexes for optimal performance and isolation
      await collection.createIndex({ tenant_id: 1 });
      await collection.createIndex({ tenant_id: 1, created_at: -1 });
      await collection.createIndex({ tenant_id: 1, updated_at: -1 });
      
      // Collection-specific indexes
      if (collectionName === 'customers') {
        await collection.createIndex({ tenant_id: 1, email: 1 }, { unique: true });
        await collection.createIndex({ tenant_id: 1, company_name: 1 });
        await collection.createIndex({ tenant_id: 1, subscription_status: 1 });
      } else if (collectionName === 'orders') {
        await collection.createIndex({ tenant_id: 1, customer_id: 1, order_date: -1 });
        await collection.createIndex({ tenant_id: 1, order_status: 1, order_date: -1 });
        await collection.createIndex({ tenant_id: 1, order_total: -1 });
      } else if (collectionName === 'products') {
        await collection.createIndex({ tenant_id: 1, sku: 1 }, { unique: true });
        await collection.createIndex({ tenant_id: 1, category: 1, name: 1 });
        await collection.createIndex({ tenant_id: 1, price: 1, inventory_count: 1 });
      }
    }
    
    // Setup tenant-specific collections for high isolation requirements
    if (this.config.schemaManagement.enableTenantSpecificCollections) {
      await this.setupTenantSpecificCollections();
    }
  }

  async setupTenantSecurity() {
    console.log('Setting up tenant-aware security and access control...');
    
    // Create tenant-specific users and roles for enhanced security
    const tenantSecurity = this.db.collection('tenant_security');
    
    await tenantSecurity.createIndex({ tenant_id: 1, user_id: 1 }, { unique: true });
    await tenantSecurity.createIndex({ tenant_id: 1, role: 1 });
    await tenantSecurity.createIndex({ tenant_id: 1, permissions: 1 });
    
    // Setup audit logging for tenant data access
    if (this.config.dataIsolation.enableAuditLogging) {
      const auditLog = this.db.collection('tenant_audit_log');
      await auditLog.createIndex({ tenant_id: 1, timestamp: -1 });
      await auditLog.createIndex({ tenant_id: 1, action: 1, timestamp: -1 });
      await auditLog.createIndex({ tenant_id: 1, user_id: 1, timestamp: -1 });
    }
  }

  async setupTenantPerformanceMonitoring() {
    console.log('Setting up tenant performance monitoring and metrics...');
    
    const performanceMetrics = this.db.collection('tenant_performance_metrics');
    
    await performanceMetrics.createIndex({ tenant_id: 1, timestamp: -1 });
    await performanceMetrics.createIndex({ tenant_id: 1, metric_type: 1, timestamp: -1 });
    await performanceMetrics.createIndex({ tenant_id: 1, collection_name: 1, timestamp: -1 });
    
    // Setup resource usage tracking
    const resourceUsage = this.db.collection('tenant_resource_usage');
    await resourceUsage.createIndex({ tenant_id: 1, date: -1 });
    await resourceUsage.createIndex({ tenant_id: 1, resource_type: 1, date: -1 });
  }

  // Tenant registration and onboarding
  async registerNewTenant(tenantData) {
    console.log(`Registering new tenant: ${tenantData.tenant_id}`);
    
    try {
      const tenantRegistry = this.db.collection('tenant_registry');
      
      // Validate tenant data and check for conflicts
      const existingTenant = await tenantRegistry.findOne({ 
        $or: [
          { tenant_id: tenantData.tenant_id },
          { subdomain: tenantData.subdomain },
          { primary_domain: tenantData.primary_domain }
        ]
      });
      
      if (existingTenant) {
        throw new Error(`Tenant with identifier already exists: ${tenantData.tenant_id}`);
      }

      // Create comprehensive tenant registration
      const tenantRegistration = {
        tenant_id: tenantData.tenant_id,
        tenant_name: tenantData.tenant_name,
        subdomain: tenantData.subdomain,
        primary_domain: tenantData.primary_domain,
        
        // Tenant configuration
        configuration: {
          tenant_tier: tenantData.tenant_tier || 'standard',
          subscription_plan: tenantData.subscription_plan || 'basic',
          max_users: tenantData.max_users || 10,
          max_storage_gb: tenantData.max_storage_gb || 5,
          max_monthly_requests: tenantData.max_monthly_requests || 10000,
          
          // Feature flags
          features: {
            enable_advanced_analytics: tenantData.enable_advanced_analytics || false,
            enable_custom_branding: tenantData.enable_custom_branding || false,
            enable_api_access: tenantData.enable_api_access || true,
            enable_webhooks: tenantData.enable_webhooks || false,
            enable_sso: tenantData.enable_sso || false
          },
          
          // Data retention and compliance
          data_retention: {
            retention_period_days: tenantData.retention_period_days || 365,
            enable_gdpr_compliance: tenantData.enable_gdpr_compliance || false,
            enable_audit_trail: tenantData.enable_audit_trail || true
          }
        },
        
        // Tenant status and metadata
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        
        // Contact and billing information
        contact_info: {
          admin_email: tenantData.admin_email,
          billing_email: tenantData.billing_email || tenantData.admin_email,
          support_contact: tenantData.support_contact
        },
        
        // Technical configuration
        technical_config: {
          database_strategy: this.tenantStrategy,
          isolation_level: this.tenantIsolationLevel,
          enable_sharding: tenantData.enable_sharding || false,
          enable_replication: tenantData.enable_replication || true,
          preferred_read_region: tenantData.preferred_read_region || 'us-east-1'
        }
      };

      // Insert tenant registration
      const registrationResult = await tenantRegistry.insertOne(tenantRegistration);
      
      // Initialize tenant-specific collections and indexes
      await this.initializeTenantResources(tenantData.tenant_id);
      
      // Create initial tenant metadata
      await this.createTenantMetadata(tenantData.tenant_id, {
        schema_version: '1.0.0',
        custom_fields: tenantData.custom_fields || {},
        ui_configuration: tenantData.ui_configuration || {},
        integration_settings: tenantData.integration_settings || {}
      });
      
      // Update tenant registry cache
      this.tenantRegistry.set(tenantData.tenant_id, tenantRegistration);
      
      console.log(`Tenant ${tenantData.tenant_id} registered successfully`);
      return {
        success: true,
        tenant_id: tenantData.tenant_id,
        registration_id: registrationResult.insertedId,
        tenant_config: tenantRegistration.configuration
      };

    } catch (error) {
      console.error(`Error registering tenant ${tenantData.tenant_id}:`, error);
      throw error;
    }
  }

  async initializeTenantResources(tenantId) {
    console.log(`Initializing resources for tenant: ${tenantId}`);
    
    // Create initial tenant data and sample records
    const collections = ['customers', 'orders', 'products', 'users'];
    
    for (const collectionName of collections) {
      const collection = this.db.collection(collectionName);
      
      // Initialize with tenant-specific welcome data
      if (collectionName === 'users') {
        await collection.insertOne({
          tenant_id: tenantId,
          user_id: 'admin',
          username: 'admin',
          email: 'admin@' + tenantId + '.com',
          role: 'tenant_admin',
          permissions: ['read', 'write', 'admin'],
          created_at: new Date(),
          updated_at: new Date(),
          status: 'active',
          profile: {
            first_name: 'Tenant',
            last_name: 'Administrator',
            timezone: 'UTC',
            language: 'en',
            theme: 'light'
          }
        });
      }
    }
    
    // Initialize tenant metrics tracking
    this.tenantMetrics.set(tenantId, {
      total_documents: 0,
      storage_usage_bytes: 0,
      monthly_requests: 0,
      last_activity: new Date(),
      performance_metrics: {
        avg_query_time_ms: 0,
        avg_throughput_ops_per_sec: 0
      }
    });
  }

  async createTenantMetadata(tenantId, metadata) {
    const tenantMetadata = this.db.collection('tenant_metadata');
    
    const metadataDocument = {
      tenant_id: tenantId,
      metadata_type: 'configuration',
      metadata: metadata,
      created_at: new Date(),
      updated_at: new Date(),
      version: 1
    };
    
    return await tenantMetadata.insertOne(metadataDocument);
  }

  // Advanced tenant data operations with isolation
  async insertTenantDocument(tenantId, collectionName, document, options = {}) {
    console.log(`Inserting document for tenant ${tenantId} into ${collectionName}`);
    
    try {
      // Validate tenant access
      await this.validateTenantAccess(tenantId);
      
      const collection = this.db.collection(collectionName);
      
      // Ensure tenant isolation
      const tenantDocument = {
        ...document,
        tenant_id: tenantId,
        created_at: new Date(),
        updated_at: new Date(),
        
        // Add tenant-specific metadata
        tenant_metadata: {
          created_by_tenant: tenantId,
          tenant_schema_version: await this.getTenantSchemaVersion(tenantId),
          isolation_level: this.tenantIsolationLevel
        }
      };
      
      // Apply tenant-specific validation and business rules
      await this.validateTenantDocument(tenantId, collectionName, tenantDocument);
      
      const result = await collection.insertOne(tenantDocument, options);
      
      // Update tenant metrics
      await this.updateTenantMetrics(tenantId, 'document_inserted', { collection: collectionName });
      
      // Log tenant activity
      if (this.config.dataIsolation.enableAuditLogging) {
        await this.logTenantActivity(tenantId, 'insert', {
          collection: collectionName,
          document_id: result.insertedId,
          timestamp: new Date()
        });
      }
      
      return result;

    } catch (error) {
      console.error(`Error inserting document for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  async queryTenantDocuments(tenantId, collectionName, query = {}, options = {}) {
    console.log(`Querying documents for tenant ${tenantId} from ${collectionName}`);
    
    try {
      // Validate tenant access
      await this.validateTenantAccess(tenantId);
      
      const collection = this.db.collection(collectionName);
      
      // Ensure tenant isolation in query
      const tenantQuery = {
        tenant_id: tenantId,
        ...query
      };
      
      // Apply tenant-specific query optimizations
      const optimizedOptions = await this.optimizeTenantQuery(tenantId, options);
      
      const startTime = Date.now();
      const results = await collection.find(tenantQuery, optimizedOptions).toArray();
      const queryTime = Date.now() - startTime;
      
      // Update tenant performance metrics
      await this.updateTenantMetrics(tenantId, 'query_executed', { 
        collection: collectionName,
        query_time_ms: queryTime,
        documents_returned: results.length
      });
      
      // Log tenant query activity
      if (this.config.dataIsolation.enableAuditLogging) {
        await this.logTenantActivity(tenantId, 'query', {
          collection: collectionName,
          query: tenantQuery,
          results_count: results.length,
          query_time_ms: queryTime,
          timestamp: new Date()
        });
      }
      
      return results;

    } catch (error) {
      console.error(`Error querying documents for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  async updateTenantDocuments(tenantId, collectionName, filter, update, options = {}) {
    console.log(`Updating documents for tenant ${tenantId} in ${collectionName}`);
    
    try {
      await this.validateTenantAccess(tenantId);
      
      const collection = this.db.collection(collectionName);
      
      // Ensure tenant isolation in filter
      const tenantFilter = {
        tenant_id: tenantId,
        ...filter
      };
      
      // Add tenant-specific update metadata
      const tenantUpdate = {
        ...update,
        $set: {
          ...update.$set,
          updated_at: new Date(),
          updated_by_tenant: tenantId
        }
      };
      
      const result = await collection.updateMany(tenantFilter, tenantUpdate, options);
      
      // Update tenant metrics
      await this.updateTenantMetrics(tenantId, 'documents_updated', { 
        collection: collectionName,
        documents_modified: result.modifiedCount
      });
      
      // Log tenant update activity
      if (this.config.dataIsolation.enableAuditLogging) {
        await this.logTenantActivity(tenantId, 'update', {
          collection: collectionName,
          filter: tenantFilter,
          update: tenantUpdate,
          documents_modified: result.modifiedCount,
          timestamp: new Date()
        });
      }
      
      return result;

    } catch (error) {
      console.error(`Error updating documents for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  async deleteTenantDocuments(tenantId, collectionName, filter, options = {}) {
    console.log(`Deleting documents for tenant ${tenantId} from ${collectionName}`);
    
    try {
      await this.validateTenantAccess(tenantId);
      
      const collection = this.db.collection(collectionName);
      
      // Ensure tenant isolation in filter
      const tenantFilter = {
        tenant_id: tenantId,
        ...filter
      };
      
      const result = await collection.deleteMany(tenantFilter, options);
      
      // Update tenant metrics
      await this.updateTenantMetrics(tenantId, 'documents_deleted', { 
        collection: collectionName,
        documents_deleted: result.deletedCount
      });
      
      // Log tenant delete activity
      if (this.config.dataIsolation.enableAuditLogging) {
        await this.logTenantActivity(tenantId, 'delete', {
          collection: collectionName,
          filter: tenantFilter,
          documents_deleted: result.deletedCount,
          timestamp: new Date()
        });
      }
      
      return result;

    } catch (error) {
      console.error(`Error deleting documents for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  // Advanced tenant analytics and reporting
  async generateTenantAnalytics(tenantId, timeRange = '30d') {
    console.log(`Generating analytics for tenant ${tenantId} for ${timeRange}`);
    
    try {
      await this.validateTenantAccess(tenantId);
      
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '24h':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
      }
      
      const analytics = {
        tenant_id: tenantId,
        time_range: timeRange,
        generated_at: new Date(),
        
        // Document counts across collections
        document_counts: await this.getTenantDocumentCounts(tenantId),
        
        // Growth metrics
        growth_metrics: await this.getTenantGrowthMetrics(tenantId, startDate, endDate),
        
        // Activity metrics
        activity_metrics: await this.getTenantActivityMetrics(tenantId, startDate, endDate),
        
        // Performance metrics
        performance_metrics: await this.getTenantPerformanceMetrics(tenantId, startDate, endDate),
        
        // Resource utilization
        resource_usage: await this.getTenantResourceUsage(tenantId, startDate, endDate)
      };
      
      return analytics;

    } catch (error) {
      console.error(`Error generating analytics for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  async getTenantDocumentCounts(tenantId) {
    const collections = ['customers', 'orders', 'products', 'users'];
    const counts = {};
    
    for (const collectionName of collections) {
      const collection = this.db.collection(collectionName);
      counts[collectionName] = await collection.countDocuments({ tenant_id: tenantId });
    }
    
    return counts;
  }

  async getTenantGrowthMetrics(tenantId, startDate, endDate) {
    const collections = ['customers', 'orders'];
    const growth = {};
    
    for (const collectionName of collections) {
      const collection = this.db.collection(collectionName);
      
      const totalCount = await collection.countDocuments({ tenant_id: tenantId });
      const periodCount = await collection.countDocuments({
        tenant_id: tenantId,
        created_at: { $gte: startDate, $lte: endDate }
      });
      
      growth[collectionName] = {
        total: totalCount,
        period_additions: periodCount,
        growth_rate: totalCount > 0 ? ((periodCount / totalCount) * 100).toFixed(2) : 0
      };
    }
    
    return growth;
  }

  // Tenant validation and security
  async validateTenantAccess(tenantId) {
    if (!this.tenantRegistry.has(tenantId)) {
      const tenantRegistry = this.db.collection('tenant_registry');
      const tenant = await tenantRegistry.findOne({ tenant_id: tenantId });
      
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }
      
      if (tenant.status !== 'active') {
        throw new Error(`Tenant inactive: ${tenantId}, status: ${tenant.status}`);
      }
      
      this.tenantRegistry.set(tenantId, tenant);
    }
    
    return true;
  }

  async validateTenantDocument(tenantId, collectionName, document) {
    // Apply tenant-specific validation rules
    const tenantConfig = await this.getTenantConfiguration(tenantId);
    
    // Validate against tenant-specific schema rules
    if (tenantConfig.schema_validation && tenantConfig.schema_validation[collectionName]) {
      const validationRules = tenantConfig.schema_validation[collectionName];
      
      for (const [field, rules] of Object.entries(validationRules)) {
        if (rules.required && !document[field]) {
          throw new Error(`Required field missing for tenant ${tenantId}: ${field}`);
        }
        
        if (rules.type && document[field] && typeof document[field] !== rules.type) {
          throw new Error(`Invalid field type for tenant ${tenantId}: ${field}, expected ${rules.type}`);
        }
      }
    }
    
    return true;
  }

  async getTenantConfiguration(tenantId) {
    if (!this.tenantRegistry.has(tenantId)) {
      await this.validateTenantAccess(tenantId);
    }
    
    return this.tenantRegistry.get(tenantId).configuration;
  }

  async updateTenantMetrics(tenantId, metricType, metricData) {
    try {
      const performanceMetrics = this.db.collection('tenant_performance_metrics');
      
      const metric = {
        tenant_id: tenantId,
        metric_type: metricType,
        metric_data: metricData,
        timestamp: new Date()
      };
      
      await performanceMetrics.insertOne(metric);
      
      // Update in-memory metrics
      if (this.tenantMetrics.has(tenantId)) {
        const tenantMetric = this.tenantMetrics.get(tenantId);
        tenantMetric.last_activity = new Date();
        
        if (metricType === 'document_inserted') {
          tenantMetric.total_documents++;
        }
      }

    } catch (error) {
      console.error(`Error updating tenant metrics for ${tenantId}:`, error);
      // Don't throw - metrics shouldn't break operations
    }
  }

  async logTenantActivity(tenantId, action, details) {
    try {
      const auditLog = this.db.collection('tenant_audit_log');
      
      const logEntry = {
        tenant_id: tenantId,
        action: action,
        details: details,
        timestamp: new Date(),
        user_id: details.user_id || 'system',
        session_id: details.session_id || null
      };
      
      await auditLog.insertOne(logEntry);

    } catch (error) {
      console.error(`Error logging tenant activity for ${tenantId}:`, error);
      // Don't throw - audit logging shouldn't break operations
    }
  }
}

// Example usage: Multi-tenant SaaS platform implementation
async function demonstrateMultiTenantArchitecture() {
  const multiTenantManager = new MongoDBMultiTenantManager('mongodb://localhost:27017', {
    tenantStrategy: 'shared_database_shared_collection',
    tenantIsolationLevel: 'logical',
    enableTenantSharding: false,
    enableAuditLogging: true,
    enableTenantMetrics: true
  });
  
  // Register new tenants
  const tenant1 = await multiTenantManager.registerNewTenant({
    tenant_id: 'acme_corp',
    tenant_name: 'Acme Corporation',
    subdomain: 'acme',
    admin_email: 'admin@acme.com',
    subscription_plan: 'enterprise',
    max_users: 100,
    max_storage_gb: 50,
    enable_advanced_analytics: true
  });
  
  const tenant2 = await multiTenantManager.registerNewTenant({
    tenant_id: 'startup_inc',
    tenant_name: 'Startup Inc',
    subdomain: 'startup',
    admin_email: 'founder@startup.com',
    subscription_plan: 'basic',
    max_users: 10,
    max_storage_gb: 5
  });
  
  // Create tenant-specific data
  await multiTenantManager.insertTenantDocument('acme_corp', 'customers', {
    company_name: 'Big Client Company',
    contact_email: 'contact@bigclient.com',
    subscription_status: 'active',
    annual_value: 50000
  });
  
  await multiTenantManager.insertTenantDocument('startup_inc', 'customers', {
    company_name: 'Small Client LLC',
    contact_email: 'hello@smallclient.com',
    subscription_status: 'trial',
    annual_value: 5000
  });
  
  // Query tenant-specific data
  const acmeCustomers = await multiTenantManager.queryTenantDocuments('acme_corp', 'customers');
  const startupCustomers = await multiTenantManager.queryTenantDocuments('startup_inc', 'customers');
  
  console.log('Acme Corp customers:', acmeCustomers.length);
  console.log('Startup Inc customers:', startupCustomers.length);
  
  // Generate tenant analytics
  const acmeAnalytics = await multiTenantManager.generateTenantAnalytics('acme_corp', '30d');
  console.log('Acme Corp analytics:', acmeAnalytics);
}

module.exports = {
  MongoDBMultiTenantManager
};
```

## Understanding MongoDB Multi-Tenant Architecture Patterns

### Database-Level Multi-Tenancy Strategies and Implementation

MongoDB supports multiple multi-tenant architecture patterns to balance isolation, performance, and cost:

```javascript
// Enterprise-grade multi-tenant architecture with advanced patterns
class EnterpriseMultiTenantArchitecture extends MongoDBMultiTenantManager {
  constructor(connectionString, enterpriseConfig) {
    super(connectionString, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      
      // Advanced tenant strategies
      enableTenantSharding: true,
      enableGlobalSecondaryIndexes: true,
      enableCrossRegionReplication: true,
      enableTenantDataEncryption: true,
      
      // Performance optimization
      enableQueryRouting: true,
      enableConnectionPooling: true,
      enableCaching: true,
      enableReadReplicas: true,
      
      // Compliance and governance
      enableDataLineage: true,
      enablePIIDetection: true,
      enableGDPRCompliance: true,
      enableSOCCompliance: true
    };
  }

  async implementShardedMultiTenancy(tenants) {
    console.log('Implementing sharded multi-tenancy architecture...');
    
    // Configure shard key strategy based on tenant distribution
    const shardKeyStrategy = await this.analyzeTenantDistribution(tenants);
    
    for (const collectionName of ['customers', 'orders', 'products']) {
      await this.enableSharding(collectionName, { tenant_id: 1 });
    }
    
    // Implement tenant-aware query routing
    await this.setupTenantQueryRouting();
    
    return shardKeyStrategy;
  }

  async setupTenantSpecificCollections(tenantId) {
    console.log(`Setting up tenant-specific collections for ${tenantId}...`);
    
    const tenantCollections = ['custom_fields', 'tenant_reports', 'integration_data'];
    
    for (const collectionName of tenantCollections) {
      const tenantSpecificCollection = `${tenantId}_${collectionName}`;
      const collection = this.db.collection(tenantSpecificCollection);
      
      // Create tenant-specific indexes and configuration
      await collection.createIndex({ created_at: -1 });
      await collection.createIndex({ updated_at: -1 });
      
      // Apply tenant-specific data retention policies
      if (collectionName === 'integration_data') {
        await collection.createIndex(
          { created_at: 1 }, 
          { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days
        );
      }
    }
  }

  async implementHybridTenantStrategy(tenants) {
    console.log('Implementing hybrid tenant strategy...');
    
    // Group tenants by size and requirements
    const tenantGroups = this.categorizeTenants(tenants);
    
    // Large tenants get dedicated collections
    for (const largeTenant of tenantGroups.large) {
      await this.setupTenantSpecificCollections(largeTenant.tenant_id);
    }
    
    // Medium tenants share collections with optimized indexes
    await this.optimizeSharedCollectionsForMediumTenants(tenantGroups.medium);
    
    // Small tenants use fully shared collections
    await this.setupSharedCollectionsForSmallTenants(tenantGroups.small);
    
    return tenantGroups;
  }

  async setupCrossRegionReplication(tenants) {
    console.log('Setting up cross-region replication for tenant data...');
    
    const replicationStrategies = new Map();
    
    for (const tenant of tenants) {
      const tenantConfig = await this.getTenantConfiguration(tenant.tenant_id);
      
      if (tenantConfig.technical_config.enable_replication) {
        const strategy = {
          primary_region: tenantConfig.technical_config.primary_region || 'us-east-1',
          replica_regions: tenantConfig.technical_config.replica_regions || ['us-west-2'],
          read_preference: tenantConfig.technical_config.read_preference || 'primaryPreferred'
        };
        
        replicationStrategies.set(tenant.tenant_id, strategy);
        
        // Configure tenant-specific read preferences
        await this.configureTenantReadPreferences(tenant.tenant_id, strategy);
      }
    }
    
    return replicationStrategies;
  }

  async implementDataResidencyCompliance(tenants) {
    console.log('Implementing data residency and compliance controls...');
    
    const complianceStrategies = new Map();
    
    for (const tenant of tenants) {
      const tenantConfig = await this.getTenantConfiguration(tenant.tenant_id);
      const dataResidencyRequirements = tenantConfig.compliance?.data_residency;
      
      if (dataResidencyRequirements) {
        const strategy = {
          allowed_regions: dataResidencyRequirements.allowed_regions,
          prohibited_regions: dataResidencyRequirements.prohibited_regions,
          encryption_requirements: dataResidencyRequirements.encryption_requirements,
          audit_requirements: dataResidencyRequirements.audit_requirements
        };
        
        complianceStrategies.set(tenant.tenant_id, strategy);
        
        // Implement tenant-specific data encryption
        if (strategy.encryption_requirements) {
          await this.setupTenantDataEncryption(tenant.tenant_id, strategy);
        }
        
        // Setup compliance audit trails
        if (strategy.audit_requirements) {
          await this.setupComplianceAuditing(tenant.tenant_id, strategy);
        }
      }
    }
    
    return complianceStrategies;
  }
}
```

## QueryLeaf Multi-Tenant Operations

QueryLeaf provides familiar SQL syntax for MongoDB multi-tenant operations and data management:

```sql
-- QueryLeaf multi-tenant database operations with SQL-familiar syntax

-- Create multi-tenant tables with automatic tenant isolation
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(100) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    subscription_status VARCHAR(50) DEFAULT 'trial',
    annual_value DECIMAL(12,2) DEFAULT 0,
    
    -- Multi-tenant metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tenant_schema_version VARCHAR(20) DEFAULT '1.0.0',
    
    -- Tenant-specific custom fields support
    custom_fields JSONB,
    
    -- Compliance and audit fields
    data_classification VARCHAR(50) DEFAULT 'internal',
    retention_policy VARCHAR(100),
    
    -- Multi-tenant constraints
    UNIQUE(tenant_id, contact_email),
    
    -- Tenant isolation index (automatically created by QueryLeaf)
    INDEX tenant_isolation_idx (tenant_id),
    INDEX tenant_customers_email_idx (tenant_id, contact_email),
    INDEX tenant_customers_status_idx (tenant_id, subscription_status, created_at DESC)
);

-- Multi-tenant orders table with relationship management
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(100) NOT NULL,
    customer_id UUID NOT NULL,
    order_number VARCHAR(100) NOT NULL,
    order_total DECIMAL(12,2) NOT NULL,
    order_status VARCHAR(50) DEFAULT 'pending',
    order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Tenant-specific order workflow
    workflow_stage VARCHAR(100),
    approval_status VARCHAR(50),
    
    -- Multi-tenant metadata  
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Custom fields for tenant-specific data
    custom_order_fields JSONB,
    integration_data JSONB,
    
    -- Multi-tenant constraints and relationships
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, customer_id),
    UNIQUE(tenant_id, order_number),
    
    -- Optimized tenant indexes
    INDEX tenant_orders_customer_idx (tenant_id, customer_id, order_date DESC),
    INDEX tenant_orders_status_idx (tenant_id, order_status, order_date DESC),
    INDEX tenant_orders_workflow_idx (tenant_id, workflow_stage, approval_status)
);

-- Multi-tenant products catalog with tenant-specific categorization
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    product_price DECIMAL(10,2) NOT NULL,
    inventory_count INTEGER DEFAULT 0,
    
    -- Tenant-specific categorization
    tenant_categories TEXT[],
    tenant_tags TEXT[],
    
    -- Product configuration per tenant
    pricing_model VARCHAR(50) DEFAULT 'fixed', -- fixed, tiered, usage_based
    pricing_tiers JSONB,
    
    -- Multi-tenant metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Custom product fields
    custom_product_attributes JSONB,
    
    -- Tenant isolation and optimization
    UNIQUE(tenant_id, sku),
    INDEX tenant_products_category_idx (tenant_id, tenant_categories),
    INDEX tenant_products_price_idx (tenant_id, product_price, inventory_count),
    INDEX tenant_products_search_idx (tenant_id, product_name, sku)
);

-- Advanced multi-tenant data operations with automatic tenant context

-- Tenant-aware data insertion (QueryLeaf automatically adds tenant_id from context)
SET SESSION tenant_context = 'acme_corp';

INSERT INTO customers (company_name, contact_email, subscription_status, annual_value, custom_fields)
VALUES 
  ('Enterprise Client A', 'contact@enterprise-a.com', 'active', 75000, '{"industry": "technology", "employees": 500}'),
  ('Enterprise Client B', 'admin@enterprise-b.com', 'active', 120000, '{"industry": "finance", "employees": 1200}'),
  ('Mid Market Client', 'hello@midmarket.com', 'active', 25000, '{"industry": "retail", "employees": 150}');

-- QueryLeaf automatically ensures tenant isolation:
-- MongoDB: db.customers.insertMany([{tenant_id: 'acme_corp', ...}])

-- Tenant-specific product catalog management
INSERT INTO products (product_name, sku, product_price, tenant_categories, custom_product_attributes)
SELECT 
  import_name,
  import_sku, 
  import_price::DECIMAL(10,2),
  ARRAY[import_primary_category, import_secondary_category],
  JSON_BUILD_OBJECT(
    'brand', import_brand,
    'model', import_model,
    'specifications', import_specifications::JSONB,
    'warranty_terms', import_warranty
  )
FROM product_import_staging
WHERE tenant_id = 'acme_corp'
  AND import_status = 'validated'
  AND import_price > 0;

-- Complex multi-tenant reporting with tenant isolation
WITH tenant_sales_summary AS (
  SELECT 
    c.tenant_id,
    c.customer_id,
    c.company_name,
    c.subscription_status,
    
    -- Order metrics
    COUNT(o.order_id) as total_orders,
    SUM(o.order_total) as total_revenue,
    AVG(o.order_total) as avg_order_value,
    MAX(o.order_date) as last_order_date,
    MIN(o.order_date) as first_order_date,
    
    -- Time-based analysis
    DATE_PART('days', MAX(o.order_date) - MIN(o.order_date)) as customer_lifetime_days,
    
    -- Revenue categorization
    CASE 
      WHEN SUM(o.order_total) >= 100000 THEN 'enterprise'
      WHEN SUM(o.order_total) >= 50000 THEN 'large'
      WHEN SUM(o.order_total) >= 10000 THEN 'medium'
      ELSE 'small'
    END as customer_segment,
    
    -- Engagement metrics
    ROUND(COUNT(o.order_id)::DECIMAL / GREATEST(DATE_PART('days', MAX(o.order_date) - MIN(o.order_date)), 1) * 30, 2) as monthly_order_frequency
    
  FROM customers c
  LEFT JOIN orders o ON c.tenant_id = o.tenant_id AND c.customer_id = o.customer_id
  WHERE c.tenant_id = 'acme_corp'  -- Automatic tenant isolation
    AND c.subscription_status = 'active'
    AND o.order_date >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY c.tenant_id, c.customer_id, c.company_name, c.subscription_status
),

revenue_analytics AS (
  SELECT 
    tenant_id,
    customer_segment,
    
    -- Segment metrics
    COUNT(*) as customers_in_segment,
    SUM(total_revenue) as segment_revenue,
    AVG(total_revenue) as avg_customer_revenue,
    AVG(avg_order_value) as segment_avg_order_value,
    AVG(monthly_order_frequency) as avg_monthly_frequency,
    
    -- Revenue distribution
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_revenue) as revenue_25th_percentile,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_revenue) as revenue_median,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_revenue) as revenue_75th_percentile,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_revenue) as revenue_90th_percentile
    
  FROM tenant_sales_summary
  GROUP BY tenant_id, customer_segment
)

-- Generate comprehensive tenant analytics report
SELECT 
  ra.tenant_id,
  ra.customer_segment,
  ra.customers_in_segment,
  
  -- Revenue metrics
  ROUND(ra.segment_revenue, 2) as segment_revenue,
  ROUND(ra.avg_customer_revenue, 2) as avg_customer_revenue,
  ROUND(ra.segment_avg_order_value, 2) as avg_order_value,
  
  -- Customer behavior
  ROUND(ra.avg_monthly_frequency, 2) as avg_monthly_orders,
  
  -- Revenue distribution insights
  ROUND(ra.revenue_median, 2) as median_customer_revenue,
  ROUND(ra.revenue_90th_percentile, 2) as top_10_percent_revenue_threshold,
  
  -- Business insights
  ROUND((ra.segment_revenue / SUM(ra.segment_revenue) OVER (PARTITION BY ra.tenant_id)) * 100, 1) as segment_revenue_percentage,
  
  -- Growth potential assessment
  CASE 
    WHEN ra.customer_segment = 'small' AND ra.avg_monthly_frequency > 2 THEN 'high_growth_potential'
    WHEN ra.customer_segment = 'medium' AND ra.avg_customer_revenue > ra.revenue_75th_percentile THEN 'upsell_opportunity'
    WHEN ra.customer_segment = 'large' AND ra.avg_monthly_frequency < 1 THEN 'retention_risk'
    WHEN ra.customer_segment = 'enterprise' THEN 'strategic_account'
    ELSE 'stable'
  END as customer_strategy_recommendation,
  
  CURRENT_TIMESTAMP as report_generated_at

FROM revenue_analytics ra
ORDER BY ra.tenant_id, 
         CASE ra.customer_segment 
           WHEN 'enterprise' THEN 1 
           WHEN 'large' THEN 2 
           WHEN 'medium' THEN 3 
           WHEN 'small' THEN 4 
         END;

-- Advanced multi-tenant data management operations

-- Tenant-specific data archiving with retention policies  
WITH archival_candidates AS (
  SELECT 
    tenant_id,
    customer_id,
    company_name,
    subscription_status,
    created_at,
    
    -- Determine archival eligibility
    CASE 
      WHEN subscription_status = 'cancelled' AND created_at < CURRENT_DATE - INTERVAL '2 years' THEN true
      WHEN subscription_status = 'trial' AND created_at < CURRENT_DATE - INTERVAL '90 days' THEN true
      WHEN subscription_status = 'inactive' AND created_at < CURRENT_DATE - INTERVAL '1 year' THEN true
      ELSE false
    END as archive_eligible,
    
    -- Calculate data retention requirements
    CASE 
      WHEN custom_fields->>'industry' = 'finance' THEN INTERVAL '7 years'
      WHEN custom_fields->>'industry' = 'healthcare' THEN INTERVAL '10 years'
      WHEN custom_fields->>'data_classification' = 'confidential' THEN INTERVAL '5 years'
      ELSE INTERVAL '3 years'
    END as retention_period,
    
    created_at + 
    CASE 
      WHEN custom_fields->>'industry' = 'finance' THEN INTERVAL '7 years'
      WHEN custom_fields->>'industry' = 'healthcare' THEN INTERVAL '10 years'
      WHEN custom_fields->>'data_classification' = 'confidential' THEN INTERVAL '5 years'
      ELSE INTERVAL '3 years'
    END as archive_after_date
    
  FROM customers
  WHERE tenant_id = 'acme_corp'
),

archival_summary AS (
  SELECT 
    tenant_id,
    COUNT(*) as total_customers,
    COUNT(*) FILTER (WHERE archive_eligible = true) as archive_eligible_count,
    COUNT(*) FILTER (WHERE archive_after_date < CURRENT_DATE) as past_retention_count,
    
    -- Archive candidates by category
    COUNT(*) FILTER (WHERE subscription_status = 'cancelled' AND archive_eligible = true) as cancelled_archive_count,
    COUNT(*) FILTER (WHERE subscription_status = 'trial' AND archive_eligible = true) as trial_archive_count,
    COUNT(*) FILTER (WHERE subscription_status = 'inactive' AND archive_eligible = true) as inactive_archive_count
    
  FROM archival_candidates
  GROUP BY tenant_id
)

-- Archive eligible customer data
INSERT INTO archived_customers (
  SELECT 
    ac.*,
    'automated_retention_policy' as archive_reason,
    CURRENT_TIMESTAMP as archived_at,
    'data_retention_service' as archived_by
  FROM archival_candidates ac
  WHERE ac.archive_eligible = true
    AND ac.archive_after_date < CURRENT_DATE
);

-- Remove archived customers from active tables (with referential integrity)
DELETE FROM customers 
WHERE tenant_id = 'acme_corp'
  AND customer_id IN (
    SELECT customer_id 
    FROM archival_candidates 
    WHERE archive_eligible = true 
      AND archive_after_date < CURRENT_DATE
  );

-- Multi-tenant schema evolution and customization management
WITH tenant_schema_analysis AS (
  SELECT 
    tenant_id,
    
    -- Analyze custom field usage
    COUNT(*) as total_customers,
    COUNT(*) FILTER (WHERE custom_fields IS NOT NULL) as customers_with_custom_fields,
    
    -- Extract commonly used custom fields
    (
      SELECT ARRAY_AGG(DISTINCT field_name)
      FROM (
        SELECT jsonb_object_keys(custom_fields) as field_name
        FROM customers 
        WHERE tenant_id = c.tenant_id AND custom_fields IS NOT NULL
      ) field_keys
    ) as custom_field_names,
    
    -- Schema version distribution
    tenant_schema_version,
    COUNT(*) FILTER (WHERE tenant_schema_version = c.tenant_schema_version) as schema_version_count
    
  FROM customers c
  WHERE tenant_id = 'acme_corp'
  GROUP BY tenant_id, tenant_schema_version
),

schema_migration_plan AS (
  SELECT 
    tsa.tenant_id,
    tsa.tenant_schema_version as current_schema_version,
    '2.0.0' as target_schema_version,
    
    -- Migration requirements
    tsa.custom_field_names,
    ARRAY['customer_tier', 'lifecycle_stage', 'health_score'] as new_standard_fields,
    
    -- Migration complexity assessment
    CASE 
      WHEN array_length(tsa.custom_field_names, 1) > 10 THEN 'complex'
      WHEN array_length(tsa.custom_field_names, 1) > 5 THEN 'moderate'
      ELSE 'simple'
    END as migration_complexity,
    
    -- Estimated migration time
    CASE 
      WHEN array_length(tsa.custom_field_names, 1) > 10 THEN '4-6 hours'
      WHEN array_length(tsa.custom_field_names, 1) > 5 THEN '2-3 hours'
      ELSE '1 hour'
    END as estimated_migration_time
    
  FROM tenant_schema_analysis tsa
  WHERE tsa.tenant_schema_version < '2.0.0'
)

-- Execute tenant-specific schema migration
UPDATE customers 
SET 
  -- Migrate custom fields to standardized structure
  custom_fields = custom_fields || 
    JSON_BUILD_OBJECT(
      'customer_tier', 
      CASE 
        WHEN annual_value >= 100000 THEN 'enterprise'
        WHEN annual_value >= 50000 THEN 'professional'  
        WHEN annual_value >= 10000 THEN 'standard'
        ELSE 'basic'
      END,
      'lifecycle_stage',
      CASE 
        WHEN subscription_status = 'trial' THEN 'prospect'
        WHEN subscription_status = 'active' AND created_at > CURRENT_DATE - INTERVAL '90 days' THEN 'new'
        WHEN subscription_status = 'active' THEN 'established'
        WHEN subscription_status = 'cancelled' THEN 'churned'
        ELSE 'unknown'
      END,
      'health_score',
      CASE 
        WHEN subscription_status = 'active' AND annual_value > 50000 THEN 85 + RANDOM() * 15
        WHEN subscription_status = 'active' AND annual_value > 10000 THEN 70 + RANDOM() * 20
        WHEN subscription_status = 'active' THEN 60 + RANDOM() * 25
        WHEN subscription_status = 'trial' THEN 45 + RANDOM() * 20
        ELSE 20 + RANDOM() * 30
      END
    ),
  
  -- Update schema version
  tenant_schema_version = '2.0.0',
  updated_at = CURRENT_TIMESTAMP
  
WHERE tenant_id = 'acme_corp'
  AND tenant_schema_version < '2.0.0';

-- QueryLeaf provides comprehensive multi-tenant capabilities:
-- 1. Automatic tenant isolation and context management
-- 2. Tenant-aware indexes and query optimization  
-- 3. Flexible schema evolution and customization support
-- 4. Advanced multi-tenant reporting and analytics
-- 5. Automated data retention and archival policies
-- 6. Cross-tenant security and compliance controls
-- 7. Performance optimization for multi-tenant workloads
-- 8. Familiar SQL syntax for complex multi-tenant operations
```

## Best Practices for MongoDB Multi-Tenant Architecture

### Tenant Isolation and Data Security Strategies

Essential principles for secure and scalable multi-tenant database design:

1. **Tenant Identification Strategy**: Implement consistent tenant identification across all collections with proper validation and access control
2. **Data Isolation Patterns**: Choose appropriate isolation levels based on security requirements, compliance needs, and performance characteristics
3. **Schema Design Flexibility**: Design schemas that support tenant-specific customizations while maintaining performance and consistency
4. **Access Control Implementation**: Implement comprehensive role-based access control with tenant-aware permissions and audit trails
5. **Performance Optimization**: Optimize indexes and queries for multi-tenant access patterns and data distribution
6. **Resource Management**: Monitor and manage tenant resource usage with quotas, throttling, and fair resource allocation

### Scalability and Performance Optimization

Optimize multi-tenant architectures for enterprise-scale requirements:

1. **Sharding Strategy**: Implement tenant-aware sharding strategies that ensure even data distribution and optimal query routing
2. **Connection Pooling**: Configure efficient connection pooling strategies that support multiple tenants without resource contention
3. **Caching Architecture**: Implement tenant-aware caching strategies that improve performance while maintaining data isolation
4. **Query Optimization**: Design queries and indexes specifically for multi-tenant access patterns and data locality
5. **Resource Monitoring**: Monitor tenant-specific performance metrics and resource utilization for proactive optimization
6. **Capacity Planning**: Plan capacity requirements based on tenant growth patterns, usage analytics, and performance requirements

## Conclusion

MongoDB multi-tenant database design provides powerful capabilities for building scalable SaaS applications that efficiently serve multiple customers through sophisticated data isolation, flexible schema architecture, and comprehensive performance optimization. The document-oriented nature of MongoDB naturally supports multi-tenant patterns while providing the scalability and operational efficiency required for modern SaaS platforms.

Key MongoDB Multi-Tenant Architecture benefits include:

- **Flexible Isolation Models**: Support for logical, physical, and hybrid tenant isolation strategies based on specific requirements
- **Cost-Effective Resource Sharing**: Efficient resource utilization through shared infrastructure while maintaining proper tenant isolation
- **Schema Flexibility**: Native support for tenant-specific customizations and schema evolution without complex migrations
- **Scalable Performance**: Built-in sharding and replication capabilities optimized for multi-tenant access patterns
- **Comprehensive Security**: Advanced access control and audit capabilities for enterprise compliance and data protection
- **SQL Accessibility**: Familiar SQL-style multi-tenant operations through QueryLeaf for accessible enterprise database management

Whether you're building a new SaaS platform, migrating from single-tenant architectures, or scaling existing multi-tenant applications, MongoDB with QueryLeaf's familiar SQL interface provides the foundation for efficient, secure, and scalable multi-tenant database architecture.

> **QueryLeaf Integration**: QueryLeaf automatically handles tenant context and isolation while providing familiar SQL syntax for complex multi-tenant operations. Advanced tenant management, data isolation, and cross-tenant analytics are seamlessly accessible through familiar SQL constructs, making sophisticated multi-tenant architecture approachable for SQL-oriented development teams.

The combination of MongoDB's robust multi-tenant capabilities with SQL-style database operations makes it an ideal platform for SaaS applications requiring both efficient multi-tenancy and familiar database management patterns, ensuring your application can scale cost-effectively while maintaining security and performance.