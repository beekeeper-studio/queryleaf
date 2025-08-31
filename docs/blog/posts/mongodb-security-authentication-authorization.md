---
title: "MongoDB Security and Authentication: SQL-Style Database Access Control"
description: "Master MongoDB security with authentication, authorization, and access control patterns. Learn role-based security, SSL/TLS configuration, and SQL-style user management for production databases."
date: 2025-08-30
tags: [mongodb, security, authentication, authorization, rbac, ssl, sql]
---

# MongoDB Security and Authentication: SQL-Style Database Access Control

Database security is fundamental to protecting sensitive data and maintaining compliance with industry regulations. Whether you're building financial applications, healthcare systems, or e-commerce platforms, implementing robust authentication and authorization controls is essential for preventing unauthorized access and data breaches.

MongoDB provides comprehensive security features including authentication mechanisms, role-based access control, network encryption, and audit logging. Combined with SQL-style security patterns, these features enable familiar database security practices while leveraging MongoDB's flexible document model and distributed architecture.

## The Database Security Challenge

Unsecured databases pose significant risks to applications and organizations:

```sql
-- Common security vulnerabilities in database systems

-- No authentication - anyone can connect
CONNECT TO database_server;
DELETE FROM customer_data;  -- No access control

-- Weak authentication - default passwords
CONNECT TO database_server 
WITH USER = 'admin', PASSWORD = 'admin';

-- Overprivileged access - unnecessary permissions
GRANT ALL PRIVILEGES ON *.* TO 'app_user'@'%';
-- Application user has dangerous system-level privileges

-- No encryption - data transmitted in plaintext  
CONNECT TO database_server:5432;
SELECT credit_card_number, ssn FROM customers;
-- Sensitive data exposed over network

-- Missing audit trail - no accountability
UPDATE sensitive_table SET value = 'modified' WHERE id = 123;
-- No record of who made changes or when
```

MongoDB security addresses these vulnerabilities through layered protection:

```javascript
// MongoDB secure connection with authentication
const secureConnection = new MongoClient('mongodb://username:password@db1.example.com:27017,db2.example.com:27017/production', {
  authSource: 'admin',
  authMechanism: 'SCRAM-SHA-256',
  ssl: true,
  sslValidate: true,
  sslCA: '/path/to/ca-certificate.pem',
  sslCert: '/path/to/client-certificate.pem',
  sslKey: '/path/to/client-private-key.pem',
  
  // Security-focused connection options
  retryWrites: true,
  readConcern: { level: 'majority' },
  writeConcern: { w: 'majority', j: true }
});

// Secure database operations with proper authentication
db.orders.find({ customer_id: ObjectId("...") }, {
  // Fields filtered by user permissions
  projection: { 
    order_id: 1, 
    items: 1, 
    total: 1,
    // credit_card_number: 0  // Hidden from this user role
  }
});
```

## MongoDB Authentication Mechanisms

### Setting Up Authentication

Configure MongoDB authentication for production environments:

```javascript
// 1. Create administrative user
use admin
db.createUser({
  user: "admin",
  pwd: passwordPrompt(),  // Secure password prompt
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" },
    { role: "dbAdminAnyDatabase", db: "admin" },
    { role: "clusterAdmin", db: "admin" }
  ]
});

// 2. Enable authentication in mongod configuration
// /etc/mongod.conf
security:
  authorization: enabled
  clusterAuthMode: x509
  
net:
  ssl:
    mode: requireSSL
    PEMKeyFile: /path/to/mongodb.pem
    CAFile: /path/to/ca.pem
    allowConnectionsWithoutCertificates: false
```

SQL-style user management comparison:

```sql
-- SQL user management equivalent patterns

-- Create administrative user
CREATE USER admin_user 
WITH PASSWORD = 'secure_password_here',
     CREATEDB = true,
     CREATEROLE = true,
     SUPERUSER = true;

-- Create application users with limited privileges  
CREATE USER app_read_user WITH PASSWORD = 'app_read_password';
CREATE USER app_write_user WITH PASSWORD = 'app_write_password';
CREATE USER analytics_user WITH PASSWORD = 'analytics_password';

-- Grant specific privileges to application users
GRANT SELECT ON ecommerce.* TO app_read_user;
GRANT SELECT, INSERT, UPDATE ON ecommerce.orders TO app_write_user;
GRANT SELECT ON analytics.* TO analytics_user;

-- Enable SSL/TLS for encrypted connections
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/path/to/server.crt';
ALTER SYSTEM SET ssl_key_file = '/path/to/server.key';
ALTER SYSTEM SET ssl_ca_file = '/path/to/ca.crt';
```

### Advanced Authentication Configuration

Implement enterprise-grade authentication:

```javascript
// LDAP authentication integration
const ldapAuthConfig = {
  security: {
    authorization: "enabled",
    ldap: {
      servers: "ldap.company.com:389",
      bind: {
        method: "simple",
        saslMechanisms: "PLAIN",
        queryUser: "cn=mongodb,ou=service-accounts,dc=company,dc=com",
        queryPassword: passwordPrompt()
      },
      userToDNMapping: '[{match: "(.+)", substitution: "cn={0},ou=users,dc=company,dc=com"}]',
      authz: {
        queryTemplate: "ou=groups,dc=company,dc=com??sub?(&(objectClass=groupOfNames)(member=cn={USER},ou=users,dc=company,dc=com))"
      }
    }
  }
};

// Kerberos authentication for enterprise environments  
const kerberosAuthConfig = {
  security: {
    authorization: "enabled", 
    sasl: {
      hostName: "mongodb.company.com",
      serviceName: "mongodb",
      saslauthdSocketPath: "/var/run/saslauthd/mux"
    }
  }
};

// X.509 certificate authentication
const x509AuthConfig = {
  security: {
    authorization: "enabled",
    clusterAuthMode: "x509"
  },
  net: {
    ssl: {
      mode: "requireSSL",
      PEMKeyFile: "/path/to/mongodb.pem",
      CAFile: "/path/to/ca.pem", 
      allowConnectionsWithoutCertificates: false,
      allowInvalidHostnames: false
    }
  }
};

// Application connection with X.509 authentication
const x509Client = new MongoClient('mongodb://db1.example.com:27017/production', {
  authMechanism: 'MONGODB-X509',
  ssl: true,
  sslCert: '/path/to/client-cert.pem',
  sslKey: '/path/to/client-key.pem',
  sslCA: '/path/to/ca-cert.pem'
});
```

## Role-Based Access Control (RBAC)

### Designing Security Roles

Create granular access control through custom roles:

```javascript
// Application-specific role definitions
use admin

// 1. Read-only analyst role
db.createRole({
  role: "analyticsReader",
  privileges: [
    {
      resource: { db: "ecommerce", collection: "orders" },
      actions: ["find", "listIndexes"]
    },
    {
      resource: { db: "ecommerce", collection: "customers" }, 
      actions: ["find", "listIndexes"]
    },
    {
      resource: { db: "analytics", collection: "" },
      actions: ["find", "listIndexes", "listCollections"]
    }
  ],
  roles: [],
  authenticationRestrictions: [
    {
      clientSource: ["192.168.1.0/24", "10.0.0.0/8"],  // IP restrictions
      serverAddress: ["mongodb.company.com"]
    }
  ]
});

// 2. Application service role with limited write access
db.createRole({
  role: "orderProcessor", 
  privileges: [
    {
      resource: { db: "ecommerce", collection: "orders" },
      actions: ["find", "insert", "update", "remove"]
    },
    {
      resource: { db: "ecommerce", collection: "inventory" },
      actions: ["find", "update"]
    },
    {
      resource: { db: "ecommerce", collection: "customers" },
      actions: ["find", "update"]
    }
  ],
  roles: [],
  authenticationRestrictions: [
    {
      clientSource: ["10.0.1.0/24"],  // Application server subnet only
      serverAddress: ["mongodb.company.com"]
    }
  ]
});

// 3. Backup service role
db.createRole({
  role: "backupOperator",
  privileges: [
    {
      resource: { db: "", collection: "" },
      actions: ["find", "listCollections", "listIndexes"]
    },
    {
      resource: { cluster: true },
      actions: ["listDatabases"]
    }
  ],
  roles: ["read"],
  authenticationRestrictions: [
    {
      clientSource: ["10.0.2.100"],  // Backup server only
      serverAddress: ["mongodb.company.com"]
    }
  ]
});

// 4. Database administrator role with time restrictions
db.createRole({
  role: "dbaLimited",
  privileges: [
    {
      resource: { db: "", collection: "" },
      actions: ["dbAdmin", "readWrite"]
    },
    {
      resource: { cluster: true },
      actions: ["clusterAdmin"]
    }
  ],
  roles: ["dbAdminAnyDatabase", "clusterAdmin"],
  authenticationRestrictions: [
    {
      clientSource: ["10.0.3.0/24"],  // Admin subnet
      serverAddress: ["mongodb.company.com"]
    }
  ]
});
```

SQL-style role management comparison:

```sql
-- SQL role-based access control equivalent

-- Create roles for different access levels
CREATE ROLE analytics_reader;
CREATE ROLE order_processor;  
CREATE ROLE backup_operator;
CREATE ROLE dba_limited;

-- Grant specific privileges to roles
-- Analytics reader - read-only access
GRANT SELECT ON ecommerce.orders TO analytics_reader;
GRANT SELECT ON ecommerce.customers TO analytics_reader;
GRANT SELECT ON analytics.* TO analytics_reader;

-- Order processor - application service access
GRANT SELECT, INSERT, UPDATE, DELETE ON ecommerce.orders TO order_processor;
GRANT SELECT, UPDATE ON ecommerce.inventory TO order_processor;
GRANT SELECT, UPDATE ON ecommerce.customers TO order_processor;

-- Backup operator - backup-specific privileges
GRANT SELECT ON *.* TO backup_operator;
GRANT SHOW DATABASES TO backup_operator;
GRANT LOCK TABLES ON *.* TO backup_operator;

-- DBA role with time-based restrictions
GRANT ALL PRIVILEGES ON *.* TO dba_limited 
WITH GRANT OPTION;

-- Create users and assign roles
CREATE USER 'analytics_service'@'192.168.1.%' 
IDENTIFIED BY 'secure_analytics_password';
GRANT analytics_reader TO 'analytics_service'@'192.168.1.%';

CREATE USER 'order_app'@'10.0.1.%'
IDENTIFIED BY 'secure_app_password';  
GRANT order_processor TO 'order_app'@'10.0.1.%';

-- Network-based access restrictions
CREATE USER 'backup_service'@'10.0.2.100'
IDENTIFIED BY 'secure_backup_password';
GRANT backup_operator TO 'backup_service'@'10.0.2.100';
```

### User Management System

Implement comprehensive user management:

```javascript
// User management system with security best practices
class MongoUserManager {
  constructor(adminDb) {
    this.adminDb = adminDb;
  }

  async createApplicationUser(userConfig) {
    // Generate secure password if not provided
    const password = userConfig.password || this.generateSecurePassword();
    
    const userDoc = {
      user: userConfig.username,
      pwd: password,
      roles: userConfig.roles || [],
      authenticationRestrictions: userConfig.restrictions || [],
      customData: {
        created_at: new Date(),
        created_by: userConfig.created_by,
        department: userConfig.department,
        purpose: userConfig.purpose
      }
    };

    try {
      await this.adminDb.createUser(userDoc);
      
      // Log user creation (excluding password)
      await this.logSecurityEvent({
        event_type: 'user_created',
        username: userConfig.username,
        roles: userConfig.roles,
        created_by: userConfig.created_by,
        timestamp: new Date()
      });

      return {
        success: true,
        username: userConfig.username,
        message: 'User created successfully'
      };
    } catch (error) {
      await this.logSecurityEvent({
        event_type: 'user_creation_failed',
        username: userConfig.username,
        error: error.message,
        timestamp: new Date()
      });
      
      throw error;
    }
  }

  async rotateUserPassword(username, newPassword) {
    try {
      await this.adminDb.updateUser(username, {
        pwd: newPassword || this.generateSecurePassword(),
        customData: {
          password_last_changed: new Date(),
          password_changed_by: 'admin'
        }
      });

      await this.logSecurityEvent({
        event_type: 'password_rotated',
        username: username,
        timestamp: new Date()
      });

      return { success: true, message: 'Password updated successfully' };
    } catch (error) {
      await this.logSecurityEvent({
        event_type: 'password_rotation_failed',
        username: username,
        error: error.message,
        timestamp: new Date()
      });
      
      throw error;
    }
  }

  async revokeUserAccess(username, reason) {
    try {
      // Update user roles to empty (effectively disabling)
      await this.adminDb.updateUser(username, {
        roles: [],
        customData: {
          access_revoked: true,
          revoked_at: new Date(),
          revoke_reason: reason
        }
      });

      await this.logSecurityEvent({
        event_type: 'user_access_revoked',
        username: username,
        reason: reason,
        timestamp: new Date()
      });

      return { success: true, message: 'User access revoked' };
    } catch (error) {
      throw error;
    }
  }

  generateSecurePassword(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async logSecurityEvent(event) {
    await this.adminDb.getSiblingDB('security_logs').collection('auth_events').insertOne(event);
  }
}
```

## Network Security and Encryption

### SSL/TLS Configuration

Secure network communications with encryption:

```javascript
// Production SSL/TLS configuration
const productionSecurityConfig = {
  // MongoDB server configuration (mongod.conf)
  net: {
    port: 27017,
    bindIp: "0.0.0.0",
    ssl: {
      mode: "requireSSL",
      PEMKeyFile: "/etc/ssl/mongodb/mongodb.pem",
      CAFile: "/etc/ssl/mongodb/ca.pem",
      allowConnectionsWithoutCertificates: false,
      allowInvalidHostnames: false,
      allowInvalidCertificates: false,
      FIPSMode: true  // FIPS 140-2 compliance
    }
  },
  
  security: {
    authorization: "enabled",
    clusterAuthMode: "x509",
    
    // Key file for internal cluster authentication
    keyFile: "/etc/ssl/mongodb/keyfile",
    
    // Enable audit logging
    auditLog: {
      destination: "file",
      format: "JSON",
      path: "/var/log/mongodb/audit.json",
      filter: {
        atype: { $in: ["authenticate", "authCheck", "createUser", "dropUser"] }
      }
    }
  }
};

// Application SSL client configuration
const sslClientConfig = {
  ssl: true,
  sslValidate: true,
  
  // Certificate authentication
  sslCA: [fs.readFileSync('/path/to/ca-certificate.pem')],
  sslCert: fs.readFileSync('/path/to/client-certificate.pem'),
  sslKey: fs.readFileSync('/path/to/client-private-key.pem'),
  
  // SSL options
  sslPass: process.env.SSL_KEY_PASSWORD,
  checkServerIdentity: true,
  
  // Security settings
  authSource: 'admin',
  authMechanism: 'MONGODB-X509'
};

// Secure connection factory
class SecureConnectionFactory {
  constructor(config) {
    this.config = config;
  }

  async createSecureConnection(database) {
    const client = new MongoClient(`mongodb+srv://${this.config.cluster}/${database}`, {
      ...sslClientConfig,
      
      // Connection pool security
      maxPoolSize: 10,  // Limit connection pool size
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      
      // Timeout configuration for security
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      
      // Read/write concerns for consistency
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority', j: true, wtimeout: 10000 }
    });

    await client.connect();
    
    // Verify connection security
    const serverStatus = await client.db().admin().command({ serverStatus: 1 });
    if (!serverStatus.security?.SSLServerSubjectName) {
      throw new Error('SSL connection verification failed');
    }

    return client;
  }
}
```

### Network Access Control

Configure firewall and network-level security:

```sql
-- SQL-style network security configuration concepts

-- Database server firewall rules
-- Allow connections only from application servers
GRANT CONNECT ON DATABASE ecommerce 
TO 'app_user'@'10.0.1.0/24';  -- Application subnet

-- Allow read-only access from analytics servers
GRANT SELECT ON ecommerce.* 
TO 'analytics_user'@'10.0.2.0/24';  -- Analytics subnet

-- Restrict administrative access to management network
GRANT ALL PRIVILEGES ON *.* 
TO 'dba_user'@'10.0.99.0/24';  -- Management subnet only

-- SSL requirements per user
ALTER USER 'app_user'@'10.0.1.%' REQUIRE SSL;
ALTER USER 'analytics_user'@'10.0.2.%' REQUIRE X509;
ALTER USER 'dba_user'@'10.0.99.%' REQUIRE CIPHER 'AES256-SHA';
```

MongoDB network access control implementation:

```javascript
// MongoDB network security configuration
const networkSecurityConfig = {
  // IP allowlist configuration
  security: {
    authorization: "enabled",
    
    // Network-based authentication restrictions
    authenticationMechanisms: ["SCRAM-SHA-256", "MONGODB-X509"],
    
    // Client certificate requirements
    net: {
      ssl: {
        mode: "requireSSL",
        allowConnectionsWithoutCertificates: false
      }
    }
  },
  
  // Bind to specific interfaces
  net: {
    bindIp: "127.0.0.1,10.0.0.10",  // Localhost and internal network only
    port: 27017
  }
};

// Application-level IP filtering
class NetworkSecurityFilter {
  constructor() {
    this.allowedNetworks = [
      '10.0.1.0/24',    // Application servers
      '10.0.2.0/24',    // Analytics servers  
      '10.0.99.0/24'    // Management network
    ];
  }

  isAllowedIP(clientIP) {
    return this.allowedNetworks.some(network => {
      return this.ipInNetwork(clientIP, network);
    });
  }

  ipInNetwork(ip, network) {
    const [networkIP, prefixLength] = network.split('/');
    const networkInt = this.ipToInt(networkIP);
    const ipInt = this.ipToInt(ip);
    const mask = (0xFFFFFFFF << (32 - parseInt(prefixLength))) >>> 0;
    
    return (networkInt & mask) === (ipInt & mask);
  }

  ipToInt(ip) {
    return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  async validateConnection(client, clientIP) {
    if (!this.isAllowedIP(clientIP)) {
      await this.logSecurityViolation({
        event: 'unauthorized_ip_access_attempt',
        client_ip: clientIP,
        timestamp: new Date()
      });
      
      throw new Error('Connection not allowed from this IP address');
    }
  }

  async logSecurityViolation(event) {
    // Log to security monitoring system
    console.error('Security violation:', event);
  }
}
```

## Data Protection and Field-Level Security

### Field-Level Encryption

Protect sensitive data with client-side field-level encryption:

```javascript
// Field-level encryption configuration
const { ClientEncryption, MongoClient } = require('mongodb');

class FieldLevelEncryption {
  constructor() {
    this.keyVaultNamespace = 'encryption.__keyVault';
    this.kmsProviders = {
      local: {
        key: Buffer.from(process.env.MASTER_KEY, 'base64')
      }
    };
  }

  async setupEncryption() {
    // Create key vault collection
    const keyVaultClient = new MongoClient(process.env.MONGODB_URI);
    await keyVaultClient.connect();
    
    const keyVaultDB = keyVaultClient.db('encryption');
    await keyVaultDB.collection('__keyVault').createIndex(
      { keyAltNames: 1 },
      { unique: true, partialFilterExpression: { keyAltNames: { $exists: true } } }
    );

    // Create data encryption keys
    const encryption = new ClientEncryption(keyVaultClient, {
      keyVaultNamespace: this.keyVaultNamespace,
      kmsProviders: this.kmsProviders
    });

    // Create keys for different data types
    const piiKeyId = await encryption.createDataKey('local', {
      keyAltNames: ['pii_encryption_key']
    });

    const financialKeyId = await encryption.createDataKey('local', {
      keyAltNames: ['financial_encryption_key']
    });

    return { piiKeyId, financialKeyId };
  }

  async createEncryptedConnection() {
    const schemaMap = {
      'ecommerce.customers': {
        bsonType: 'object',
        properties: {
          ssn: {
            encrypt: {
              keyId: [{ $binary: { base64: process.env.PII_KEY_ID, subType: '04' } }],
              bsonType: 'string',
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
            }
          },
          credit_card: {
            encrypt: {
              keyId: [{ $binary: { base64: process.env.FINANCIAL_KEY_ID, subType: '04' } }],
              bsonType: 'string', 
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
            }
          }
        }
      }
    };

    return new MongoClient(process.env.MONGODB_URI, {
      autoEncryption: {
        keyVaultNamespace: this.keyVaultNamespace,
        kmsProviders: this.kmsProviders,
        schemaMap: schemaMap,
        bypassAutoEncryption: false
      }
    });
  }
}
```

### Data Masking and Redaction

Implement data protection for non-production environments:

```javascript
// Data masking for development/testing environments
class DataMaskingService {
  constructor(db) {
    this.db = db;
  }

  async maskSensitiveData(collection, sensitiveFields) {
    const maskingOperations = [];

    for (const field of sensitiveFields) {
      maskingOperations.push({
        updateMany: {
          filter: { [field]: { $exists: true, $ne: null } },
          update: [
            {
              $set: {
                [field]: {
                  $concat: [
                    { $substr: [{ $toString: "$" + field }, 0, 2] },
                    "***MASKED***",
                    { $substr: [{ $toString: "$" + field }, -2, -1] }
                  ]
                }
              }
            }
          ]
        }
      });
    }

    return await this.db.collection(collection).bulkWrite(maskingOperations);
  }

  async createMaskedView(sourceCollection, viewName, maskingRules) {
    const pipeline = [
      {
        $addFields: this.buildMaskingFields(maskingRules)
      },
      {
        $unset: Object.keys(maskingRules)  // Remove original sensitive fields
      }
    ];

    return await this.db.createCollection(viewName, {
      viewOn: sourceCollection,
      pipeline: pipeline
    });
  }

  buildMaskingFields(maskingRules) {
    const fields = {};
    
    for (const [fieldName, maskingType] of Object.entries(maskingRules)) {
      switch (maskingType) {
        case 'email':
          fields[fieldName + '_masked'] = {
            $concat: [
              { $substr: ["$" + fieldName, 0, 2] },
              "***@",
              { $arrayElemAt: [{ $split: ["$" + fieldName, "@"] }, 1] }
            ]
          };
          break;
          
        case 'phone':
          fields[fieldName + '_masked'] = {
            $concat: [
              { $substr: ["$" + fieldName, 0, 3] },
              "-***-",
              { $substr: ["$" + fieldName, -4, -1] }
            ]
          };
          break;
          
        case 'credit_card':
          fields[fieldName + '_masked'] = "****-****-****-1234";
          break;
          
        case 'full_mask':
          fields[fieldName + '_masked'] = "***REDACTED***";
          break;
      }
    }
    
    return fields;
  }
}
```

## Audit Logging and Compliance

### Comprehensive Audit System

Implement audit logging for compliance and security monitoring:

```sql
-- SQL-style audit logging concepts

-- Enable audit logging for all DML operations
CREATE AUDIT POLICY comprehensive_audit
FOR ALL STATEMENTS
TO FILE = '/var/log/database/audit.log'
WITH (
  QUEUE_DELAY = 1000,
  ON_FAILURE = CONTINUE,
  AUDIT_GUID = TRUE
);

-- Audit specific security events
CREATE AUDIT POLICY security_events
FOR LOGIN_FAILED,
    USER_CHANGE_PASSWORD_GROUP,
    SUCCESSFUL_DATABASE_AUTHENTICATION_GROUP,
    FAILED_DATABASE_AUTHENTICATION_GROUP,
    DATABASE_PRINCIPAL_CHANGE_GROUP
TO APPLICATION_LOG
WITH (QUEUE_DELAY = 0);

-- Query audit logs for security analysis
SELECT 
  event_time,
  action_id,
  session_id,
  server_principal_name,
  database_name,
  schema_name,
  object_name,
  statement,
  succeeded
FROM audit_log
WHERE event_time >= DATEADD(hour, -24, GETDATE())
  AND action_id IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  AND object_name LIKE '%sensitive%'
ORDER BY event_time DESC;
```

MongoDB audit logging implementation:

```javascript
// MongoDB comprehensive audit logging
class MongoAuditLogger {
  constructor(db) {
    this.db = db;
    this.auditDb = db.getSiblingDB('audit_logs');
  }

  async setupAuditCollection() {
    // Create capped collection for audit logs
    await this.auditDb.createCollection('database_operations', {
      capped: true,
      size: 1024 * 1024 * 100,  // 100MB
      max: 1000000              // 1M documents
    });

    // Index for efficient querying
    await this.auditDb.collection('database_operations').createIndexes([
      { event_time: -1 },
      { user: 1, event_time: -1 },
      { operation: 1, collection: 1, event_time: -1 },
      { ip_address: 1, event_time: -1 }
    ]);
  }

  async logDatabaseOperation(operation) {
    const auditRecord = {
      event_time: new Date(),
      event_id: this.generateEventId(),
      user: operation.user || 'system',
      ip_address: operation.clientIP,
      operation: operation.type,
      database: operation.database,
      collection: operation.collection,
      document_count: operation.documentCount || 0,
      query_filter: operation.filter ? JSON.stringify(operation.filter) : null,
      fields_accessed: operation.fields || [],
      success: operation.success,
      error_message: operation.error || null,
      execution_time_ms: operation.duration || 0,
      session_id: operation.sessionId,
      application: operation.application || 'unknown'
    };

    try {
      await this.auditDb.collection('database_operations').insertOne(auditRecord);
    } catch (error) {
      // Log to external system if database logging fails
      console.error('Failed to log audit record:', error);
    }
  }

  async getSecurityReport(timeframe = 24) {
    const since = new Date(Date.now() - timeframe * 3600000);
    
    const pipeline = [
      {
        $match: {
          event_time: { $gte: since }
        }
      },
      {
        $group: {
          _id: {
            user: "$user",
            operation: "$operation",
            collection: "$collection"
          },
          operation_count: { $sum: 1 },
          failed_operations: {
            $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] }
          },
          avg_execution_time: { $avg: "$execution_time_ms" },
          unique_ip_addresses: { $addToSet: "$ip_address" }
        }
      },
      {
        $addFields: {
          failure_rate: {
            $divide: ["$failed_operations", "$operation_count"]
          },
          ip_count: { $size: "$unique_ip_addresses" }
        }
      },
      {
        $match: {
          $or: [
            { failure_rate: { $gt: 0.1 } },  // >10% failure rate
            { ip_count: { $gt: 3 } },        // Multiple IP addresses
            { avg_execution_time: { $gt: 1000 } }  // Slow operations
          ]
        }
      }
    ];

    return await this.auditDb.collection('database_operations').aggregate(pipeline).toArray();
  }

  generateEventId() {
    return new ObjectId().toString();
  }
}
```

## QueryLeaf Security Integration

QueryLeaf provides familiar SQL-style security management with MongoDB's robust security features:

```sql
-- QueryLeaf security configuration with SQL-familiar syntax

-- Create users with SQL-style syntax
CREATE USER analytics_reader 
WITH PASSWORD = 'secure_password'
AUTHENTICATION_METHOD = 'SCRAM-SHA-256'
NETWORK_RESTRICTIONS = ['10.0.2.0/24', '192.168.1.0/24'];

CREATE USER order_service
WITH PASSWORD = 'service_password'  
AUTHENTICATION_METHOD = 'X509'
CERTIFICATE_SUBJECT = 'CN=order-service,OU=applications,O=company';

-- Grant privileges using familiar SQL patterns
GRANT SELECT ON ecommerce.orders TO analytics_reader;
GRANT SELECT ON ecommerce.customers TO analytics_reader
WITH FIELD_RESTRICTIONS = ('ssn', 'credit_card_number');  -- QueryLeaf extension

GRANT SELECT, INSERT, UPDATE ON ecommerce.orders TO order_service;
GRANT UPDATE ON ecommerce.inventory TO order_service;

-- Connection security configuration
SET SESSION SSL_MODE = 'REQUIRE';
SET SESSION READ_CONCERN = 'majority';
SET SESSION WRITE_CONCERN = '{ w: "majority", j: true }';

-- QueryLeaf automatically handles:
-- 1. MongoDB role creation and privilege mapping
-- 2. SSL/TLS connection configuration  
-- 3. Authentication mechanism selection
-- 4. Network access restriction enforcement
-- 5. Audit logging for all SQL operations
-- 6. Field-level access control through projections

-- Audit queries using SQL syntax
SELECT 
  event_time,
  username,
  operation_type,
  collection_name,
  success,
  execution_time_ms
FROM audit_logs.database_operations
WHERE event_time >= CURRENT_DATE - INTERVAL '1 day'
  AND operation_type IN ('INSERT', 'UPDATE', 'DELETE')
  AND success = false
ORDER BY event_time DESC;

-- Security monitoring with SQL aggregations
WITH failed_logins AS (
  SELECT 
    username,
    ip_address,
    COUNT(*) AS failure_count,
    MAX(event_time) AS last_failure
  FROM audit_logs.authentication_events
  WHERE event_time >= CURRENT_DATE - INTERVAL '1 hour'
    AND success = false
  GROUP BY username, ip_address
  HAVING COUNT(*) >= 5
)
SELECT 
  username,
  ip_address,
  failure_count,
  last_failure,
  'POTENTIAL_BRUTE_FORCE' AS alert_type
FROM failed_logins
ORDER BY failure_count DESC;
```

## Security Best Practices

### Production Security Checklist

Essential security configurations for production MongoDB deployments:

1. **Authentication**: Enable authentication with strong mechanisms (SCRAM-SHA-256, X.509)
2. **Authorization**: Implement least-privilege access with custom roles
3. **Network Security**: Use SSL/TLS encryption and IP allowlists
4. **Audit Logging**: Enable comprehensive audit logging for compliance
5. **Data Protection**: Implement field-level encryption for sensitive data
6. **Regular Updates**: Keep MongoDB and drivers updated with security patches
7. **Monitoring**: Deploy security monitoring and alerting systems
8. **Backup Security**: Secure backup files with encryption and access controls

### Operational Security

Implement ongoing security operational practices:

1. **Regular Security Reviews**: Audit user privileges and access patterns quarterly
2. **Password Rotation**: Implement automated password rotation for service accounts  
3. **Certificate Management**: Monitor SSL certificate expiration and renewal
4. **Penetration Testing**: Regular security testing of database access controls
5. **Incident Response**: Establish procedures for security incident handling

## Conclusion

MongoDB security provides enterprise-grade protection through comprehensive authentication, authorization, and encryption capabilities. Combined with SQL-style security management patterns, MongoDB enables familiar database security practices while delivering the scalability and flexibility required for modern applications.

Key security benefits include:

- **Authentication Flexibility**: Multiple authentication mechanisms for different environments and requirements
- **Granular Authorization**: Role-based access control with field-level and operation-level permissions
- **Network Protection**: SSL/TLS encryption and network-based access controls  
- **Data Protection**: Field-level encryption and data masking capabilities
- **Compliance Support**: Comprehensive audit logging and monitoring for regulatory requirements

Whether you're building financial systems, healthcare applications, or enterprise SaaS platforms, MongoDB security with QueryLeaf's familiar SQL interface provides the foundation for secure database architectures. This combination enables you to implement robust security controls while preserving the development patterns and operational practices your team already knows.

The integration of enterprise security features with SQL-style management makes MongoDB security both comprehensive and accessible, ensuring your applications remain protected as they scale and evolve.