---
title: "MongoDB Event Sourcing and CQRS: Distributed Systems Architecture with Immutable Audit Trails and Command Query Separation"
description: "Master MongoDB event sourcing and CQRS patterns for building resilient distributed systems with complete audit trails, eventual consistency, and command-query separation using advanced aggregation pipelines and SQL-familiar patterns."
date: 2025-12-31
tags: [mongodb, event-sourcing, cqrs, distributed-systems, audit-trails, microservices, aggregation, sql]
---

# MongoDB Event Sourcing and CQRS: Distributed Systems Architecture with Immutable Audit Trails and Command Query Separation

Modern distributed systems require architectural patterns that ensure data consistency, provide complete audit trails, and enable scalable read/write operations across microservices boundaries. Traditional CRUD architectures struggle with distributed consistency challenges, complex business rules validation, and the need for comprehensive historical data tracking, particularly when dealing with financial transactions, regulatory compliance, or complex business processes that require precise event ordering and replay capabilities.

MongoDB event sourcing and Command Query Responsibility Segregation (CQRS) provide sophisticated architectural patterns that store system changes as immutable event sequences rather than current state snapshots. This approach enables complete system state reconstruction, provides natural audit trails, supports complex business logic validation, and allows independent scaling of read and write operations while maintaining eventual consistency across distributed system boundaries.

## The Traditional State-Based Architecture Challenge

Conventional CRUD-based systems face significant limitations in distributed environments and audit-sensitive applications:

```sql
-- Traditional PostgreSQL state-based architecture - limited auditability and scalability
CREATE TABLE bank_accounts (
    account_id BIGINT PRIMARY KEY,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_holder VARCHAR(255) NOT NULL,
    current_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    account_type VARCHAR(50) NOT NULL,
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    
    -- Basic audit fields (insufficient for compliance)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT NOT NULL,
    updated_by BIGINT NOT NULL
);

CREATE TABLE transactions (
    transaction_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    from_account_id BIGINT REFERENCES bank_accounts(account_id),
    to_account_id BIGINT REFERENCES bank_accounts(account_id),
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- Limited audit information
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reference_number VARCHAR(100),
    description TEXT
);

-- Traditional transaction processing (problematic in distributed systems)
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Step 1: Validate source account
SELECT account_id, current_balance, account_status 
FROM bank_accounts 
WHERE account_id = $1 AND account_status = 'active'
FOR UPDATE;

-- Step 2: Validate destination account
SELECT account_id, account_status 
FROM bank_accounts 
WHERE account_id = $2 AND account_status = 'active'
FOR UPDATE;

-- Step 3: Check sufficient funds
IF (SELECT current_balance FROM bank_accounts WHERE account_id = $1) >= $3 THEN
    
    -- Step 4: Update source account balance
    UPDATE bank_accounts 
    SET current_balance = current_balance - $3,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $4
    WHERE account_id = $1;
    
    -- Step 5: Update destination account balance
    UPDATE bank_accounts 
    SET current_balance = current_balance + $3,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $4
    WHERE account_id = $2;
    
    -- Step 6: Record transaction
    INSERT INTO transactions (
        from_account_id, to_account_id, transaction_type, 
        amount, transaction_status, processed_at, reference_number, description
    )
    VALUES ($1, $2, 'transfer', $3, 'completed', CURRENT_TIMESTAMP, $5, $6);
    
ELSE
    RAISE EXCEPTION 'Insufficient funds';
END IF;

COMMIT;

-- Problems with traditional state-based architecture:
-- 1. Lost historical information - only current state is preserved
-- 2. Audit trail limitations - changes tracked inadequately
-- 3. Distributed consistency challenges - difficult to maintain ACID across services
-- 4. Complex business logic validation - scattered across multiple update statements
-- 5. Limited replay capability - cannot reconstruct past states reliably
-- 6. Scalability bottlenecks - read and write operations compete for same resources
-- 7. Integration complexity - difficult to publish domain events to other systems
-- 8. Compliance gaps - insufficient audit trails for regulatory requirements
-- 9. Error recovery challenges - complex rollback procedures
-- 10. Testing difficulties - hard to reproduce exact historical conditions

-- Audit queries are complex and incomplete
WITH account_history AS (
    SELECT 
        account_id,
        'balance_update' as event_type,
        updated_at as event_timestamp,
        updated_by as user_id,
        current_balance as new_value,
        LAG(current_balance) OVER (
            PARTITION BY account_id 
            ORDER BY updated_at
        ) as previous_value
    FROM bank_accounts_audit -- Requires separate audit table setup
    WHERE account_id = $1
    
    UNION ALL
    
    SELECT 
        COALESCE(from_account_id, to_account_id) as account_id,
        transaction_type as event_type,
        processed_at as event_timestamp,
        created_by as user_id,
        amount as new_value,
        NULL as previous_value
    FROM transactions
    WHERE from_account_id = $1 OR to_account_id = $1
)

SELECT 
    event_timestamp,
    event_type,
    new_value,
    previous_value,
    COALESCE(new_value - previous_value, new_value) as change_amount,
    
    -- Limited reconstruction capability
    SUM(COALESCE(new_value - previous_value, new_value)) OVER (
        ORDER BY event_timestamp 
        ROWS UNBOUNDED PRECEDING
    ) as running_balance
    
FROM account_history
ORDER BY event_timestamp DESC
LIMIT 100;

-- Challenges with traditional audit approaches:
-- 1. Incomplete event capture - many state changes not properly tracked
-- 2. Limited business context - technical changes without domain meaning
-- 3. Performance overhead - separate audit tables and triggers
-- 4. Query complexity - reconstructing historical states requires complex joins
-- 5. Storage inefficiency - duplicate data in audit tables
-- 6. Consistency issues - audit and primary data can become out of sync
-- 7. Limited replay capability - cannot fully recreate business scenarios
-- 8. Integration challenges - difficult to publish meaningful events to external systems
```

MongoDB event sourcing provides comprehensive solutions for these distributed system challenges:

```javascript
// MongoDB Event Sourcing and CQRS Implementation
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017/?replicaSet=rs0');
const db = client.db('event_sourcing_system');

// Advanced Event Sourcing and CQRS Manager
class MongoDBEventSourcedSystem {
  constructor(db, config = {}) {
    this.db = db;
    this.collections = {
      eventStore: db.collection('event_store'),
      aggregateSnapshots: db.collection('aggregate_snapshots'),
      readModels: {
        accountSummary: db.collection('account_summary_view'),
        transactionHistory: db.collection('transaction_history_view'),
        complianceAudit: db.collection('compliance_audit_view'),
        balanceProjections: db.collection('balance_projections_view')
      },
      commandHandlers: db.collection('command_handlers'),
      eventSubscriptions: db.collection('event_subscriptions'),
      sagaState: db.collection('saga_state')
    };
    
    this.config = {
      // Event store configuration
      snapshotFrequency: config.snapshotFrequency || 100,
      eventRetentionDays: config.eventRetentionDays || 2555, // 7 years for compliance
      enableCompression: config.enableCompression !== false,
      enableEncryption: config.enableEncryption || false,
      
      // CQRS configuration
      readModelUpdateBatchSize: config.readModelUpdateBatchSize || 1000,
      eventualConsistencyTimeout: config.eventualConsistencyTimeout || 30000,
      enableOptimisticConcurrency: config.enableOptimisticConcurrency !== false,
      
      // Business configuration
      maxTransactionAmount: config.maxTransactionAmount || 1000000,
      enableFraudDetection: config.enableFraudDetection !== false,
      enableRegulatory Compliance: config.enableRegulatoryCompliance !== false,
      
      // Performance configuration
      enableEventIndexing: config.enableEventIndexing !== false,
      enableReadModelCaching: config.enableReadModelCaching !== false,
      eventProcessingConcurrency: config.eventProcessingConcurrency || 10
    };
    
    this.setupEventStore();
    this.initializeReadModels();
    this.startEventProcessors();
  }

  async setupEventStore() {
    console.log('Setting up MongoDB event store with advanced indexing...');
    
    try {
      // Create event store with optimal indexes for event sourcing patterns
      await this.collections.eventStore.createIndexes([
        // Primary event lookup by aggregate
        { 
          key: { aggregateId: 1, version: 1 }, 
          unique: true,
          name: 'aggregate_version_unique'
        },
        
        // Event ordering and streaming
        { 
          key: { aggregateId: 1, eventTimestamp: 1 }, 
          name: 'aggregate_chronological'
        },
        
        // Global event ordering for projections
        { 
          key: { eventTimestamp: 1, _id: 1 }, 
          name: 'global_event_order'
        },
        
        // Event type filtering
        { 
          key: { eventType: 1, eventTimestamp: 1 }, 
          name: 'event_type_chronological'
        },
        
        // Compliance and audit queries
        { 
          key: { 'eventData.userId': 1, eventTimestamp: 1 }, 
          name: 'user_audit_trail'
        },
        
        // Correlation and saga support
        { 
          key: { correlationId: 1 }, 
          sparse: true,
          name: 'correlation_lookup'
        },
        
        // Event replay and reconstruction
        { 
          key: { aggregateType: 1, eventTimestamp: 1 }, 
          name: 'aggregate_type_replay'
        }
      ]);
      
      // Create snapshot collection indexes
      await this.collections.aggregateSnapshots.createIndexes([
        { 
          key: { aggregateId: 1, version: -1 }, 
          name: 'latest_snapshot_lookup'
        },
        
        { 
          key: { aggregateType: 1, snapshotTimestamp: -1 }, 
          name: 'aggregate_type_snapshots'
        }
      ]);
      
      console.log('Event store indexes created successfully');
      
    } catch (error) {
      console.error('Error setting up event store:', error);
      throw error;
    }
  }

  async handleCommand(command) {
    console.log(`Processing command: ${command.commandType}`);
    
    try {
      // Start distributed transaction for command processing
      const session = client.startSession();
      
      let result;
      
      await session.withTransaction(async () => {
        // Load current aggregate state
        const aggregate = await this.loadAggregate(command.aggregateId, session);
        
        // Validate command against current state and business rules
        const validation = await this.validateCommand(command, aggregate);
        if (!validation.valid) {
          throw new Error(`Command validation failed: ${validation.reason}`);
        }
        
        // Execute command and generate events
        const events = await this.executeCommand(command, aggregate);
        
        // Store events in event store
        result = await this.storeEvents(command.aggregateId, events, aggregate.version, session);
        
        // Update aggregate snapshot if needed
        if ((aggregate.version + events.length) % this.config.snapshotFrequency === 0) {
          await this.createSnapshot(command.aggregateId, events, session);
        }
        
      }, {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary'
      });
      
      await session.endSession();
      
      // Publish events for read model updates (eventual consistency)
      await this.publishEventsForProcessing(result.events);
      
      return {
        success: true,
        aggregateId: command.aggregateId,
        version: result.newVersion,
        eventsGenerated: result.events.length
      };
      
    } catch (error) {
      console.error('Error handling command:', error);
      throw error;
    }
  }

  async executeCommand(command, aggregate) {
    const events = [];
    const timestamp = new Date();
    const commandId = new ObjectId();
    
    switch (command.commandType) {
      case 'CreateAccount':
        events.push({
          eventId: new ObjectId(),
          aggregateId: command.aggregateId,
          aggregateType: 'BankAccount',
          eventType: 'AccountCreated',
          eventVersion: '1.0',
          eventTimestamp: timestamp,
          commandId: commandId,
          
          eventData: {
            accountNumber: command.data.accountNumber,
            accountHolder: command.data.accountHolder,
            accountType: command.data.accountType,
            initialBalance: command.data.initialBalance || 0,
            currency: command.data.currency || 'USD',
            createdBy: command.userId,
            createdAt: timestamp
          },
          
          eventMetadata: {
            sourceIp: command.metadata?.sourceIp,
            userAgent: command.metadata?.userAgent,
            correlationId: command.correlationId,
            causationId: command.causationId
          }
        });
        break;
        
      case 'TransferFunds':
        // Generate comprehensive events for fund transfer
        const transferId = new ObjectId();
        
        // Debit event
        events.push({
          eventId: new ObjectId(),
          aggregateId: command.data.fromAccountId,
          aggregateType: 'BankAccount', 
          eventType: 'FundsDebited',
          eventVersion: '1.0',
          eventTimestamp: timestamp,
          commandId: commandId,
          
          eventData: {
            transferId: transferId,
            amount: command.data.amount,
            currency: command.data.currency || 'USD',
            toAccountId: command.data.toAccountId,
            reference: command.data.reference,
            description: command.data.description,
            debitedBy: command.userId,
            debitedAt: timestamp,
            
            // Business context
            transferType: 'outbound',
            feeAmount: command.data.feeAmount || 0,
            exchangeRate: command.data.exchangeRate || 1.0
          },
          
          eventMetadata: {
            sourceIp: command.metadata?.sourceIp,
            userAgent: command.metadata?.userAgent,
            correlationId: command.correlationId,
            causationId: command.causationId,
            regulatoryFlags: this.calculateRegulatoryFlags(command)
          }
        });
        
        // Credit event (separate aggregate)
        events.push({
          eventId: new ObjectId(),
          aggregateId: command.data.toAccountId,
          aggregateType: 'BankAccount',
          eventType: 'FundsCredited', 
          eventVersion: '1.0',
          eventTimestamp: timestamp,
          commandId: commandId,
          
          eventData: {
            transferId: transferId,
            amount: command.data.amount,
            currency: command.data.currency || 'USD',
            fromAccountId: command.data.fromAccountId,
            reference: command.data.reference,
            description: command.data.description,
            creditedBy: command.userId,
            creditedAt: timestamp,
            
            // Business context
            transferType: 'inbound',
            feeAmount: 0,
            exchangeRate: command.data.exchangeRate || 1.0
          },
          
          eventMetadata: {
            sourceIp: command.metadata?.sourceIp,
            userAgent: command.metadata?.userAgent,
            correlationId: command.correlationId,
            causationId: command.causationId,
            regulatoryFlags: this.calculateRegulatoryFlags(command)
          }
        });
        break;
        
      case 'FreezeAccount':
        events.push({
          eventId: new ObjectId(),
          aggregateId: command.aggregateId,
          aggregateType: 'BankAccount',
          eventType: 'AccountFrozen',
          eventVersion: '1.0',
          eventTimestamp: timestamp,
          commandId: commandId,
          
          eventData: {
            reason: command.data.reason,
            frozenBy: command.userId,
            frozenAt: timestamp,
            expectedDuration: command.data.expectedDuration,
            complianceReference: command.data.complianceReference
          },
          
          eventMetadata: {
            sourceIp: command.metadata?.sourceIp,
            userAgent: command.metadata?.userAgent,
            correlationId: command.correlationId,
            causationId: command.causationId,
            securityLevel: 'high'
          }
        });
        break;
        
      default:
        throw new Error(`Unknown command type: ${command.commandType}`);
    }
    
    return events;
  }

  async validateCommand(command, aggregate) {
    console.log(`Validating command: ${command.commandType} for aggregate: ${command.aggregateId}`);
    
    try {
      switch (command.commandType) {
        case 'CreateAccount':
          // Check if account already exists
          if (aggregate.currentState && aggregate.currentState.accountNumber) {
            return { 
              valid: false, 
              reason: 'Account already exists'
            };
          }
          
          // Validate account number uniqueness
          const existingAccount = await this.collections.readModels.accountSummary.findOne({
            accountNumber: command.data.accountNumber
          });
          
          if (existingAccount) {
            return { 
              valid: false, 
              reason: 'Account number already in use'
            };
          }
          
          return { valid: true };
          
        case 'TransferFunds':
          // Validate source account exists and is active
          if (!aggregate.currentState || aggregate.currentState.status !== 'active') {
            return { 
              valid: false, 
              reason: 'Source account not found or not active'
            };
          }
          
          // Check sufficient funds
          if (aggregate.currentState.balance < command.data.amount + (command.data.feeAmount || 0)) {
            return { 
              valid: false, 
              reason: 'Insufficient funds'
            };
          }
          
          // Validate destination account
          const destinationAccount = await this.collections.readModels.accountSummary.findOne({
            _id: command.data.toAccountId,
            status: 'active'
          });
          
          if (!destinationAccount) {
            return { 
              valid: false, 
              reason: 'Destination account not found or not active'
            };
          }
          
          // Business rule validations
          if (command.data.amount > this.config.maxTransactionAmount) {
            return { 
              valid: false, 
              reason: `Transaction amount exceeds maximum allowed (${this.config.maxTransactionAmount})`
            };
          }
          
          // Fraud detection
          if (this.config.enableFraudDetection) {
            const fraudCheck = await this.performFraudDetection(command, aggregate);
            if (!fraudCheck.valid) {
              return fraudCheck;
            }
          }
          
          return { valid: true };
          
        case 'FreezeAccount':
          if (!aggregate.currentState || aggregate.currentState.status === 'frozen') {
            return { 
              valid: false, 
              reason: 'Account not found or already frozen'
            };
          }
          
          return { valid: true };
          
        default:
          return { 
            valid: false, 
            reason: `Unknown command type: ${command.commandType}`
          };
      }
    } catch (error) {
      console.error('Error validating command:', error);
      return { 
        valid: false, 
        reason: `Validation error: ${error.message}`
      };
    }
  }

  async storeEvents(aggregateId, events, expectedVersion, session) {
    console.log(`Storing ${events.length} events for aggregate: ${aggregateId}`);
    
    try {
      const eventsToStore = events.map((event, index) => ({
        ...event,
        aggregateId: aggregateId,
        version: expectedVersion + index + 1,
        storedAt: new Date()
      }));
      
      // Store events with optimistic concurrency control
      const result = await this.collections.eventStore.insertMany(
        eventsToStore,
        { session }
      );
      
      return {
        events: eventsToStore,
        newVersion: expectedVersion + events.length,
        storedEventIds: result.insertedIds
      };
      
    } catch (error) {
      if (error.code === 11000) { // Duplicate key error
        throw new Error('Concurrency conflict - aggregate was modified by another process');
      }
      throw error;
    }
  }

  async loadAggregate(aggregateId, session = null) {
    console.log(`Loading aggregate: ${aggregateId}`);
    
    try {
      // Try to load latest snapshot
      const snapshot = await this.collections.aggregateSnapshots
        .findOne(
          { aggregateId: aggregateId },
          { 
            sort: { version: -1 },
            session: session
          }
        );
      
      let fromVersion = 0;
      let currentState = null;
      
      if (snapshot) {
        fromVersion = snapshot.version;
        currentState = snapshot.snapshotData;
      }
      
      // Load events since snapshot
      const events = await this.collections.eventStore
        .find(
          {
            aggregateId: aggregateId,
            version: { $gt: fromVersion }
          },
          {
            sort: { version: 1 },
            session: session
          }
        )
        .toArray();
      
      // Replay events to build current state
      let version = fromVersion;
      for (const event of events) {
        currentState = this.applyEvent(currentState, event);
        version = event.version;
      }
      
      return {
        aggregateId: aggregateId,
        version: version,
        currentState: currentState,
        lastModified: events.length > 0 ? events[events.length - 1].eventTimestamp : 
                      snapshot?.snapshotTimestamp || null
      };
      
    } catch (error) {
      console.error('Error loading aggregate:', error);
      throw error;
    }
  }

  applyEvent(currentState, event) {
    // Event replay logic for state reconstruction
    let newState = currentState ? { ...currentState } : {};
    
    switch (event.eventType) {
      case 'AccountCreated':
        newState = {
          accountId: event.aggregateId,
          accountNumber: event.eventData.accountNumber,
          accountHolder: event.eventData.accountHolder,
          accountType: event.eventData.accountType,
          balance: event.eventData.initialBalance,
          currency: event.eventData.currency,
          status: 'active',
          createdAt: event.eventData.createdAt,
          createdBy: event.eventData.createdBy,
          version: event.version
        };
        break;
        
      case 'FundsDebited':
        newState.balance = (newState.balance || 0) - event.eventData.amount - (event.eventData.feeAmount || 0);
        newState.lastTransactionAt = event.eventTimestamp;
        newState.version = event.version;
        break;
        
      case 'FundsCredited':
        newState.balance = (newState.balance || 0) + event.eventData.amount;
        newState.lastTransactionAt = event.eventTimestamp;
        newState.version = event.version;
        break;
        
      case 'AccountFrozen':
        newState.status = 'frozen';
        newState.frozenAt = event.eventData.frozenAt;
        newState.frozenBy = event.eventData.frozenBy;
        newState.frozenReason = event.eventData.reason;
        newState.version = event.version;
        break;
        
      default:
        console.warn(`Unknown event type for replay: ${event.eventType}`);
    }
    
    return newState;
  }

  async createSnapshot(aggregateId, recentEvents, session) {
    console.log(`Creating snapshot for aggregate: ${aggregateId}`);
    
    try {
      // Rebuild current state
      const aggregate = await this.loadAggregate(aggregateId, session);
      
      const snapshot = {
        _id: new ObjectId(),
        aggregateId: aggregateId,
        aggregateType: 'BankAccount', // This should be dynamic based on aggregate type
        version: aggregate.version,
        snapshotData: aggregate.currentState,
        snapshotTimestamp: new Date(),
        eventCount: aggregate.version,
        
        // Metadata
        compressionEnabled: this.config.enableCompression,
        encryptionEnabled: this.config.enableEncryption
      };
      
      await this.collections.aggregateSnapshots.replaceOne(
        { aggregateId: aggregateId },
        snapshot,
        { upsert: true, session }
      );
      
      console.log(`Snapshot created for aggregate ${aggregateId} at version ${aggregate.version}`);
      
    } catch (error) {
      console.error('Error creating snapshot:', error);
      // Don't fail the main transaction for snapshot errors
    }
  }

  async publishEventsForProcessing(events) {
    console.log(`Publishing ${events.length} events for read model processing`);
    
    try {
      // Publish events to read model processors (eventual consistency)
      for (const event of events) {
        await this.updateReadModels(event);
      }
      
      // Trigger any saga workflows
      await this.processSagaEvents(events);
      
    } catch (error) {
      console.error('Error publishing events for processing:', error);
      // Log error but don't fail - eventual consistency will retry
    }
  }

  async updateReadModels(event) {
    console.log(`Updating read models for event: ${event.eventType}`);
    
    try {
      switch (event.eventType) {
        case 'AccountCreated':
          await this.collections.readModels.accountSummary.replaceOne(
            { _id: event.aggregateId },
            {
              _id: event.aggregateId,
              accountNumber: event.eventData.accountNumber,
              accountHolder: event.eventData.accountHolder,
              accountType: event.eventData.accountType,
              currentBalance: event.eventData.initialBalance,
              currency: event.eventData.currency,
              status: 'active',
              createdAt: event.eventData.createdAt,
              createdBy: event.eventData.createdBy,
              lastUpdated: event.eventTimestamp,
              version: event.version
            },
            { upsert: true }
          );
          break;
          
        case 'FundsDebited':
        case 'FundsCredited':
          // Update account summary
          const balanceChange = event.eventType === 'FundsCredited' ? 
            event.eventData.amount : 
            -(event.eventData.amount + (event.eventData.feeAmount || 0));
          
          await this.collections.readModels.accountSummary.updateOne(
            { _id: event.aggregateId },
            {
              $inc: { currentBalance: balanceChange },
              $set: { 
                lastTransactionAt: event.eventTimestamp,
                lastUpdated: event.eventTimestamp,
                version: event.version
              }
            }
          );
          
          // Create transaction history entry
          await this.collections.readModels.transactionHistory.insertOne({
            _id: new ObjectId(),
            transactionId: event.eventData.transferId,
            accountId: event.aggregateId,
            eventId: event.eventId,
            transactionType: event.eventType,
            amount: event.eventData.amount,
            currency: event.eventData.currency,
            counterpartyAccountId: event.eventType === 'FundsCredited' ? 
              event.eventData.fromAccountId : event.eventData.toAccountId,
            reference: event.eventData.reference,
            description: event.eventData.description,
            timestamp: event.eventTimestamp,
            feeAmount: event.eventData.feeAmount || 0,
            exchangeRate: event.eventData.exchangeRate,
            balanceAfter: null, // Will be calculated in a separate process
            
            // Audit and compliance
            processedBy: event.eventData.debitedBy || event.eventData.creditedBy,
            sourceIp: event.eventMetadata?.sourceIp,
            regulatoryFlags: event.eventMetadata?.regulatoryFlags || []
          });
          
          // Update compliance audit view
          await this.updateComplianceAudit(event);
          
          break;
          
        case 'AccountFrozen':
          await this.collections.readModels.accountSummary.updateOne(
            { _id: event.aggregateId },
            {
              $set: {
                status: 'frozen',
                frozenAt: event.eventData.frozenAt,
                frozenBy: event.eventData.frozenBy,
                frozenReason: event.eventData.reason,
                lastUpdated: event.eventTimestamp,
                version: event.version
              }
            }
          );
          break;
      }
      
    } catch (error) {
      console.error('Error updating read models:', error);
      // In a production system, you'd want to implement retry logic here
    }
  }

  async updateComplianceAudit(event) {
    // Create comprehensive compliance audit entries
    const auditEntry = {
      _id: new ObjectId(),
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      timestamp: event.eventTimestamp,
      
      // Financial details
      amount: event.eventData.amount,
      currency: event.eventData.currency,
      
      // Regulatory information
      regulatoryFlags: event.eventMetadata?.regulatoryFlags || [],
      complianceReferences: event.eventData.complianceReference ? [event.eventData.complianceReference] : [],
      
      // User and system context
      performedBy: event.eventData.debitedBy || event.eventData.creditedBy,
      sourceIp: event.eventMetadata?.sourceIp,
      userAgent: event.eventMetadata?.userAgent,
      
      // Traceability
      correlationId: event.eventMetadata?.correlationId,
      causationId: event.eventMetadata?.causationId,
      
      // Classification
      riskLevel: this.calculateRiskLevel(event),
      complianceCategories: this.classifyCompliance(event),
      
      // Retention
      retentionDate: new Date(Date.now() + this.config.eventRetentionDays * 24 * 60 * 60 * 1000)
    };
    
    await this.collections.readModels.complianceAudit.insertOne(auditEntry);
  }

  async getAccountHistory(accountId, options = {}) {
    console.log(`Retrieving account history for: ${accountId}`);
    
    try {
      const limit = options.limit || 100;
      const fromDate = options.fromDate || new Date(0);
      const toDate = options.toDate || new Date();
      
      // Query events with temporal filtering
      const events = await this.collections.eventStore.aggregate([
        {
          $match: {
            aggregateId: accountId,
            eventTimestamp: { $gte: fromDate, $lte: toDate }
          }
        },
        {
          $sort: { version: options.reverse ? -1 : 1 }
        },
        {
          $limit: limit
        },
        {
          $project: {
            eventId: 1,
            eventType: 1,
            eventTimestamp: 1,
            version: 1,
            eventData: 1,
            eventMetadata: 1,
            
            // Add business-friendly formatting
            humanReadableType: {
              $switch: {
                branches: [
                  { case: { $eq: ['$eventType', 'AccountCreated'] }, then: 'Account Opened' },
                  { case: { $eq: ['$eventType', 'FundsDebited'] }, then: 'Funds Withdrawn' },
                  { case: { $eq: ['$eventType', 'FundsCredited'] }, then: 'Funds Deposited' },
                  { case: { $eq: ['$eventType', 'AccountFrozen'] }, then: 'Account Frozen' }
                ],
                default: '$eventType'
              }
            }
          }
        }
      ]).toArray();
      
      // Optionally rebuild state at each point for balance tracking
      if (options.includeBalanceHistory) {
        let runningBalance = 0;
        
        for (const event of events) {
          switch (event.eventType) {
            case 'AccountCreated':
              runningBalance = event.eventData.initialBalance || 0;
              break;
            case 'FundsCredited':
              runningBalance += event.eventData.amount;
              break;
            case 'FundsDebited':
              runningBalance -= (event.eventData.amount + (event.eventData.feeAmount || 0));
              break;
          }
          
          event.balanceAfterEvent = runningBalance;
        }
      }
      
      return {
        accountId: accountId,
        events: events,
        totalEvents: events.length,
        dateRange: { from: fromDate, to: toDate }
      };
      
    } catch (error) {
      console.error('Error retrieving account history:', error);
      throw error;
    }
  }

  async getComplianceAuditTrail(filters = {}) {
    console.log('Generating compliance audit trail...');
    
    try {
      const pipeline = [];
      
      // Match stage based on filters
      const matchStage = {};
      
      if (filters.accountId) {
        matchStage.aggregateId = filters.accountId;
      }
      
      if (filters.userId) {
        matchStage.performedBy = filters.userId;
      }
      
      if (filters.dateRange) {
        matchStage.timestamp = {
          $gte: filters.dateRange.start,
          $lte: filters.dateRange.end
        };
      }
      
      if (filters.riskLevel) {
        matchStage.riskLevel = filters.riskLevel;
      }
      
      if (filters.complianceCategories) {
        matchStage.complianceCategories = { $in: filters.complianceCategories };
      }
      
      pipeline.push({ $match: matchStage });
      
      // Sort by timestamp
      pipeline.push({
        $sort: { timestamp: -1 }
      });
      
      // Add limit if specified
      if (filters.limit) {
        pipeline.push({ $limit: filters.limit });
      }
      
      // Enhance with additional context
      pipeline.push({
        $lookup: {
          from: 'account_summary_view',
          localField: 'aggregateId',
          foreignField: '_id',
          as: 'accountInfo'
        }
      });
      
      pipeline.push({
        $addFields: {
          accountInfo: { $arrayElemAt: ['$accountInfo', 0] }
        }
      });
      
      const auditTrail = await this.collections.readModels.complianceAudit
        .aggregate(pipeline)
        .toArray();
      
      return {
        auditEntries: auditTrail,
        totalEntries: auditTrail.length,
        generatedAt: new Date(),
        filters: filters
      };
      
    } catch (error) {
      console.error('Error generating compliance audit trail:', error);
      throw error;
    }
  }

  // Utility methods for business logic
  calculateRegulatoryFlags(command) {
    const flags = [];
    
    if (command.commandType === 'TransferFunds') {
      if (command.data.amount >= 10000) {
        flags.push('large_transaction');
      }
      
      if (command.data.currency !== 'USD') {
        flags.push('foreign_currency');
      }
      
      // Add more regulatory checks as needed
    }
    
    return flags;
  }
  
  calculateRiskLevel(event) {
    if (event.eventMetadata?.regulatoryFlags?.includes('large_transaction')) {
      return 'high';
    }
    
    if (event.eventData.amount > 1000) {
      return 'medium';
    }
    
    return 'low';
  }
  
  classifyCompliance(event) {
    const categories = ['financial_transaction'];
    
    if (event.eventMetadata?.regulatoryFlags?.includes('large_transaction')) {
      categories.push('aml_monitoring');
    }
    
    if (event.eventMetadata?.regulatoryFlags?.includes('foreign_currency')) {
      categories.push('currency_reporting');
    }
    
    return categories;
  }
  
  async performFraudDetection(command, aggregate) {
    // Simplified fraud detection logic
    const recentTransactions = await this.collections.readModels.transactionHistory
      .countDocuments({
        accountId: command.data.fromAccountId,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
    
    if (recentTransactions > 20) {
      return {
        valid: false,
        reason: 'Suspicious activity detected - too many transactions in 24 hours'
      };
    }
    
    return { valid: true };
  }
}

module.exports = { MongoDBEventSourcedSystem };
```

## Advanced Event Sourcing Patterns and CQRS Implementation

### Sophisticated Saga Orchestration and Process Management

Implement complex business processes using event-driven saga patterns:

```javascript
// Advanced Saga and Process Manager for Complex Business Workflows
class EventSourcedSagaManager {
  constructor(db, eventSystem) {
    this.db = db;
    this.eventSystem = eventSystem;
    this.sagas = {
      transferSaga: db.collection('transfer_saga_state'),
      complianceSaga: db.collection('compliance_saga_state'),
      fraudSaga: db.collection('fraud_detection_saga_state')
    };
    
    this.setupSagaProcessors();
  }
  
  async handleSagaEvent(event) {
    console.log(`Processing saga event: ${event.eventType}`);
    
    switch (event.eventType) {
      case 'FundsDebited':
        await this.processFundTransferSaga(event);
        await this.processComplianceSaga(event);
        break;
        
      case 'SuspiciousActivityDetected':
        await this.processFraudInvestigationSaga(event);
        break;
        
      case 'ComplianceReviewRequired':
        await this.processComplianceReviewSaga(event);
        break;
    }
  }
  
  async processFundTransferSaga(event) {
    const sagaId = event.eventData.transferId;
    
    // Load or create saga state
    let sagaState = await this.sagas.transferSaga.findOne({ sagaId: sagaId });
    
    if (!sagaState) {
      sagaState = {
        sagaId: sagaId,
        sagaType: 'FundTransfer',
        state: 'DebitCompleted',
        fromAccountId: event.aggregateId,
        toAccountId: event.eventData.toAccountId,
        amount: event.eventData.amount,
        currency: event.eventData.currency,
        startedAt: event.eventTimestamp,
        
        // Saga workflow state
        steps: {
          debitCompleted: true,
          creditPending: true,
          notificationSent: false,
          auditRecorded: false
        },
        
        // Compensation tracking
        compensationEvents: [],
        
        // Timeout handling
        timeoutAt: new Date(Date.now() + 300000), // 5 minute timeout
        
        // Error handling
        retryCount: 0,
        maxRetries: 3,
        lastError: null
      };
    }
    
    // Process next saga step
    if (sagaState.state === 'DebitCompleted' && !sagaState.steps.creditPending) {
      await this.sendCreditCommand(sagaState);
      sagaState.state = 'CreditPending';
    }
    
    // Update saga state
    await this.sagas.transferSaga.replaceOne(
      { sagaId: sagaId },
      sagaState,
      { upsert: true }
    );
  }
  
  async sendCreditCommand(sagaState) {
    const creditCommand = {
      commandType: 'CreditFunds',
      aggregateId: sagaState.toAccountId,
      commandId: new ObjectId(),
      correlationId: sagaState.sagaId,
      
      data: {
        transferId: sagaState.sagaId,
        amount: sagaState.amount,
        currency: sagaState.currency,
        fromAccountId: sagaState.fromAccountId,
        reference: `Transfer from ${sagaState.fromAccountId}`
      },
      
      metadata: {
        sagaId: sagaState.sagaId,
        sagaType: sagaState.sagaType
      }
    };
    
    await this.eventSystem.handleCommand(creditCommand);
  }
  
  async processComplianceSaga(event) {
    if (event.eventData.amount >= 10000) {
      const sagaId = new ObjectId();
      
      const complianceSaga = {
        sagaId: sagaId,
        sagaType: 'ComplianceReview',
        state: 'ReviewRequired',
        transactionEventId: event.eventId,
        accountId: event.aggregateId,
        amount: event.eventData.amount,
        
        // Review workflow
        reviewSteps: {
          amlCheck: 'pending',
          riskAssessment: 'pending',
          manualReview: 'pending',
          regulatoryReporting: 'pending'
        },
        
        reviewAssignedTo: null,
        reviewDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
        
        startedAt: event.eventTimestamp,
        timeoutAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };
      
      await this.sagas.complianceSaga.insertOne(complianceSaga);
      
      // Trigger automated compliance checks
      await this.triggerAutomatedComplianceChecks(complianceSaga);
    }
  }
  
  async triggerAutomatedComplianceChecks(sagaState) {
    // Trigger AML check
    const amlCommand = {
      commandType: 'PerformAMLCheck',
      aggregateId: new ObjectId(),
      commandId: new ObjectId(),
      
      data: {
        transactionEventId: sagaState.transactionEventId,
        accountId: sagaState.accountId,
        amount: sagaState.amount,
        sagaId: sagaState.sagaId
      }
    };
    
    await this.eventSystem.handleCommand(amlCommand);
  }
}
```

## SQL-Style Event Sourcing and CQRS with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB event sourcing and CQRS operations:

```sql
-- QueryLeaf Event Sourcing and CQRS operations with SQL-familiar syntax

-- Create event store collections with proper configuration
CREATE COLLECTION event_store 
WITH (
  storage_engine = 'wiredTiger',
  compression = 'zlib'
);

CREATE COLLECTION aggregate_snapshots
WITH (
  storage_engine = 'wiredTiger', 
  compression = 'snappy'
);

-- Query event store for complete audit trail with sophisticated filtering
WITH event_timeline AS (
  SELECT 
    event_id,
    aggregate_id,
    aggregate_type,
    event_type,
    event_timestamp,
    version,
    
    -- Extract key business data
    JSON_EXTRACT(event_data, '$.amount') as transaction_amount,
    JSON_EXTRACT(event_data, '$.accountNumber') as account_number,
    JSON_EXTRACT(event_data, '$.transferId') as transfer_id,
    JSON_EXTRACT(event_data, '$.fromAccountId') as from_account,
    JSON_EXTRACT(event_data, '$.toAccountId') as to_account,
    
    -- Extract audit context
    JSON_EXTRACT(event_metadata, '$.sourceIp') as source_ip,
    JSON_EXTRACT(event_metadata, '$.userAgent') as user_agent,
    JSON_EXTRACT(event_metadata, '$.correlationId') as correlation_id,
    JSON_EXTRACT(event_data, '$.debitedBy') as performed_by,
    JSON_EXTRACT(event_data, '$.creditedBy') as credited_by,
    
    -- Extract regulatory information
    JSON_EXTRACT(event_metadata, '$.regulatoryFlags') as regulatory_flags,
    JSON_EXTRACT(event_data, '$.complianceReference') as compliance_ref,
    
    -- Event classification
    CASE event_type
      WHEN 'AccountCreated' THEN 'account_lifecycle'
      WHEN 'FundsDebited' THEN 'financial_transaction'
      WHEN 'FundsCredited' THEN 'financial_transaction'
      WHEN 'AccountFrozen' THEN 'security_action'
      ELSE 'other'
    END as event_category,
    
    -- Transaction direction analysis
    CASE event_type
      WHEN 'FundsDebited' THEN 'outbound'
      WHEN 'FundsCredited' THEN 'inbound'
      ELSE 'non_transaction'
    END as transaction_direction,
    
    -- Risk level calculation
    CASE 
      WHEN JSON_EXTRACT(event_data, '$.amount')::DECIMAL > 50000 THEN 'high'
      WHEN JSON_EXTRACT(event_data, '$.amount')::DECIMAL > 10000 THEN 'medium'
      WHEN JSON_EXTRACT(event_data, '$.amount')::DECIMAL > 1000 THEN 'low'
      ELSE 'minimal'
    END as risk_level
    
  FROM event_store
  WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '90 days'
),

aggregate_state_reconstruction AS (
  -- Reconstruct current state for each aggregate using window functions
  SELECT 
    aggregate_id,
    event_timestamp,
    event_type,
    version,
    
    -- Running balance calculation for accounts
    CASE 
      WHEN event_type = 'AccountCreated' THEN 
        JSON_EXTRACT(event_data, '$.initialBalance')::DECIMAL
      WHEN event_type = 'FundsCredited' THEN 
        JSON_EXTRACT(event_data, '$.amount')::DECIMAL
      WHEN event_type = 'FundsDebited' THEN 
        -(JSON_EXTRACT(event_data, '$.amount')::DECIMAL + COALESCE(JSON_EXTRACT(event_data, '$.feeAmount')::DECIMAL, 0))
      ELSE 0
    END as balance_change,
    
    SUM(CASE 
      WHEN event_type = 'AccountCreated' THEN 
        JSON_EXTRACT(event_data, '$.initialBalance')::DECIMAL
      WHEN event_type = 'FundsCredited' THEN 
        JSON_EXTRACT(event_data, '$.amount')::DECIMAL
      WHEN event_type = 'FundsDebited' THEN 
        -(JSON_EXTRACT(event_data, '$.amount')::DECIMAL + COALESCE(JSON_EXTRACT(event_data, '$.feeAmount')::DECIMAL, 0))
      ELSE 0
    END) OVER (
      PARTITION BY aggregate_id 
      ORDER BY version 
      ROWS UNBOUNDED PRECEDING
    ) as current_balance,
    
    -- Account status reconstruction
    LAST_VALUE(CASE 
      WHEN event_type = 'AccountCreated' THEN 'active'
      WHEN event_type = 'AccountFrozen' THEN 'frozen'
      ELSE NULL
    END IGNORE NULLS) OVER (
      PARTITION BY aggregate_id 
      ORDER BY version 
      ROWS UNBOUNDED PRECEDING
    ) as current_status,
    
    -- Transaction count
    COUNT(*) FILTER (WHERE event_category = 'financial_transaction') OVER (
      PARTITION BY aggregate_id 
      ORDER BY version 
      ROWS UNBOUNDED PRECEDING
    ) as transaction_count
    
  FROM event_timeline
),

transaction_flow_analysis AS (
  -- Analyze transaction flows between accounts
  SELECT 
    et.transfer_id,
    et.correlation_id,
    
    -- Debit side
    MAX(CASE WHEN et.transaction_direction = 'outbound' THEN et.aggregate_id END) as debit_account,
    MAX(CASE WHEN et.transaction_direction = 'outbound' THEN et.transaction_amount END) as debit_amount,
    MAX(CASE WHEN et.transaction_direction = 'outbound' THEN et.event_timestamp END) as debit_timestamp,
    
    -- Credit side  
    MAX(CASE WHEN et.transaction_direction = 'inbound' THEN et.aggregate_id END) as credit_account,
    MAX(CASE WHEN et.transaction_direction = 'inbound' THEN et.transaction_amount END) as credit_amount,
    MAX(CASE WHEN et.transaction_direction = 'inbound' THEN et.event_timestamp END) as credit_timestamp,
    
    -- Flow analysis
    COUNT(*) as event_count,
    COUNT(CASE WHEN et.transaction_direction = 'outbound' THEN 1 END) as debit_events,
    COUNT(CASE WHEN et.transaction_direction = 'inbound' THEN 1 END) as credit_events,
    
    -- Transfer completeness
    CASE 
      WHEN COUNT(CASE WHEN et.transaction_direction = 'outbound' THEN 1 END) > 0 
       AND COUNT(CASE WHEN et.transaction_direction = 'inbound' THEN 1 END) > 0 THEN 'completed'
      WHEN COUNT(CASE WHEN et.transaction_direction = 'outbound' THEN 1 END) > 0 THEN 'partial_debit'
      WHEN COUNT(CASE WHEN et.transaction_direction = 'inbound' THEN 1 END) > 0 THEN 'partial_credit'
      ELSE 'unknown'
    END as transfer_status,
    
    -- Risk indicators
    MAX(et.risk_level) as max_risk_level,
    ARRAY_AGG(DISTINCT JSON_EXTRACT_ARRAY(et.regulatory_flags)) as all_regulatory_flags,
    
    -- Timing analysis
    EXTRACT(EPOCH FROM (
      MAX(CASE WHEN et.transaction_direction = 'inbound' THEN et.event_timestamp END) - 
      MAX(CASE WHEN et.transaction_direction = 'outbound' THEN et.event_timestamp END)
    )) as transfer_duration_seconds
    
  FROM event_timeline et
  WHERE et.transfer_id IS NOT NULL
    AND et.event_category = 'financial_transaction'
  GROUP BY et.transfer_id, et.correlation_id
),

compliance_risk_assessment AS (
  -- Comprehensive compliance and risk analysis
  SELECT 
    et.aggregate_id as account_id,
    et.performed_by as user_id,
    et.source_ip,
    
    -- Volume analysis
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE et.event_category = 'financial_transaction') as transaction_count,
    SUM(et.transaction_amount::DECIMAL) FILTER (WHERE et.transaction_direction = 'outbound') as total_debits,
    SUM(et.transaction_amount::DECIMAL) FILTER (WHERE et.transaction_direction = 'inbound') as total_credits,
    
    -- Risk indicators
    COUNT(*) FILTER (WHERE et.risk_level = 'high') as high_risk_transactions,
    COUNT(*) FILTER (WHERE JSON_ARRAY_LENGTH(et.regulatory_flags) > 0) as flagged_transactions,
    COUNT(DISTINCT et.source_ip) as unique_ip_addresses,
    
    -- Behavioral patterns
    AVG(et.transaction_amount::DECIMAL) FILTER (WHERE et.event_category = 'financial_transaction') as avg_transaction_amount,
    MAX(et.transaction_amount::DECIMAL) FILTER (WHERE et.event_category = 'financial_transaction') as max_transaction_amount,
    MIN(et.event_timestamp) as first_activity,
    MAX(et.event_timestamp) as last_activity,
    
    -- Compliance flags
    COUNT(*) FILTER (WHERE et.compliance_ref IS NOT NULL) as compliance_referenced_events,
    ARRAY_AGG(DISTINCT et.compliance_ref) FILTER (WHERE et.compliance_ref IS NOT NULL) as compliance_references,
    
    -- Geographic indicators
    COUNT(DISTINCT et.source_ip) as ip_diversity,
    
    -- Velocity analysis
    COUNT(*) FILTER (WHERE et.event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as events_last_24h,
    COUNT(*) FILTER (WHERE et.event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as events_last_hour,
    
    -- Overall risk score calculation
    LEAST(100, 
      COALESCE(COUNT(*) FILTER (WHERE et.risk_level = 'high') * 20, 0) +
      COALESCE(COUNT(*) FILTER (WHERE JSON_ARRAY_LENGTH(et.regulatory_flags) > 0) * 15, 0) +
      COALESCE(COUNT(DISTINCT et.source_ip) * 5, 0) +
      CASE WHEN COUNT(*) FILTER (WHERE et.event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') > 10 THEN 25 ELSE 0 END
    ) as calculated_risk_score
    
  FROM event_timeline et
  WHERE et.event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY et.aggregate_id, et.performed_by, et.source_ip
)

-- Comprehensive event sourcing analysis dashboard
SELECT 
  'Event Sourcing System Analysis' as report_type,
  CURRENT_TIMESTAMP as generated_at,
  
  -- System overview
  JSON_OBJECT(
    'total_events', (SELECT COUNT(*) FROM event_timeline),
    'total_aggregates', (SELECT COUNT(DISTINCT aggregate_id) FROM event_timeline),
    'event_types', (SELECT JSON_OBJECT_AGG(event_type, type_count) FROM (
      SELECT event_type, COUNT(*) as type_count 
      FROM event_timeline 
      GROUP BY event_type
    ) type_stats),
    'date_range', JSON_OBJECT(
      'earliest_event', (SELECT MIN(event_timestamp) FROM event_timeline),
      'latest_event', (SELECT MAX(event_timestamp) FROM event_timeline)
    )
  ) as system_overview,
  
  -- Account state summary
  JSON_OBJECT(
    'total_accounts', (SELECT COUNT(DISTINCT aggregate_id) FROM aggregate_state_reconstruction),
    'active_accounts', (SELECT COUNT(DISTINCT aggregate_id) FROM aggregate_state_reconstruction WHERE current_status = 'active'),
    'frozen_accounts', (SELECT COUNT(DISTINCT aggregate_id) FROM aggregate_state_reconstruction WHERE current_status = 'frozen'),
    'total_balance', (SELECT SUM(DISTINCT current_balance) FROM (
      SELECT aggregate_id, LAST_VALUE(current_balance) OVER (PARTITION BY aggregate_id ORDER BY version ROWS UNBOUNDED PRECEDING) as current_balance
      FROM aggregate_state_reconstruction
    ) final_balances),
    'avg_transactions_per_account', (SELECT AVG(DISTINCT transaction_count) FROM (
      SELECT aggregate_id, LAST_VALUE(transaction_count) OVER (PARTITION BY aggregate_id ORDER BY version ROWS UNBOUNDED PRECEDING) as transaction_count
      FROM aggregate_state_reconstruction
    ) txn_counts)
  ) as account_summary,
  
  -- Transaction flow analysis
  JSON_OBJECT(
    'total_transfers', (SELECT COUNT(*) FROM transaction_flow_analysis),
    'completed_transfers', (SELECT COUNT(*) FROM transaction_flow_analysis WHERE transfer_status = 'completed'),
    'partial_transfers', (SELECT COUNT(*) FROM transaction_flow_analysis WHERE transfer_status LIKE 'partial_%'),
    'avg_transfer_duration_seconds', (
      SELECT AVG(transfer_duration_seconds) 
      FROM transaction_flow_analysis 
      WHERE transfer_status = 'completed' AND transfer_duration_seconds > 0
    ),
    'high_risk_transfers', (SELECT COUNT(*) FROM transaction_flow_analysis WHERE max_risk_level = 'high'),
    'flagged_transfers', (SELECT COUNT(*) FROM transaction_flow_analysis WHERE ARRAY_LENGTH(all_regulatory_flags, 1) > 0)
  ) as transfer_analysis,
  
  -- Compliance and risk insights
  JSON_OBJECT(
    'high_risk_accounts', (SELECT COUNT(*) FROM compliance_risk_assessment WHERE calculated_risk_score > 50),
    'accounts_with_compliance_flags', (SELECT COUNT(*) FROM compliance_risk_assessment WHERE compliance_referenced_events > 0),
    'high_velocity_accounts', (SELECT COUNT(*) FROM compliance_risk_assessment WHERE events_last_hour > 5),
    'multi_ip_accounts', (SELECT COUNT(*) FROM compliance_risk_assessment WHERE ip_diversity > 3),
    'avg_risk_score', (SELECT AVG(calculated_risk_score) FROM compliance_risk_assessment)
  ) as compliance_insights,
  
  -- Event sourcing health metrics
  JSON_OBJECT(
    'events_per_day_avg', (
      SELECT AVG(daily_count) FROM (
        SELECT DATE_TRUNC('day', event_timestamp) as event_date, COUNT(*) as daily_count
        FROM event_timeline
        GROUP BY DATE_TRUNC('day', event_timestamp)
      ) daily_stats
    ),
    'largest_aggregate_event_count', (
      SELECT MAX(aggregate_event_count) FROM (
        SELECT aggregate_id, COUNT(*) as aggregate_event_count
        FROM event_timeline
        GROUP BY aggregate_id
      ) aggregate_stats
    ),
    'event_store_efficiency', 
      CASE 
        WHEN (SELECT COUNT(*) FROM event_timeline) > 1000000 THEN 'high_volume'
        WHEN (SELECT COUNT(*) FROM event_timeline) > 100000 THEN 'medium_volume'
        ELSE 'low_volume'
      END
  ) as system_health,
  
  -- Top risk accounts (limit to top 10)
  (SELECT JSON_AGG(
    JSON_OBJECT(
      'account_id', account_id,
      'risk_score', calculated_risk_score,
      'transaction_count', transaction_count,
      'total_volume', ROUND((total_debits + total_credits)::NUMERIC, 2),
      'ip_diversity', ip_diversity,
      'last_activity', last_activity
    )
  ) FROM (
    SELECT * FROM compliance_risk_assessment 
    WHERE calculated_risk_score > 30
    ORDER BY calculated_risk_score DESC 
    LIMIT 10
  ) top_risks) as high_risk_accounts,
  
  -- System recommendations
  ARRAY[
    CASE WHEN (SELECT COUNT(*) FROM transaction_flow_analysis WHERE transfer_status LIKE 'partial_%') > 0
         THEN 'Investigate partial transfers - possible saga failures or timeout issues' END,
    CASE WHEN (SELECT AVG(calculated_risk_score) FROM compliance_risk_assessment) > 25
         THEN 'Overall risk score elevated - review compliance monitoring thresholds' END,
    CASE WHEN (SELECT COUNT(*) FROM compliance_risk_assessment WHERE events_last_hour > 10) > 0
         THEN 'High-velocity accounts detected - review rate limiting and fraud detection' END,
    CASE WHEN (SELECT MAX(transfer_duration_seconds) FROM transaction_flow_analysis WHERE transfer_status = 'completed') > 300
         THEN 'Some transfers taking over 5 minutes - investigate saga timeout configurations' END
  ]::TEXT[] as recommendations;

-- Event store maintenance and optimization queries
WITH event_store_stats AS (
  SELECT 
    aggregate_type,
    event_type,
    COUNT(*) as event_count,
    MIN(event_timestamp) as earliest_event,
    MAX(event_timestamp) as latest_event,
    AVG(LENGTH(JSON_UNPARSE(event_data))) as avg_event_size,
    COUNT(DISTINCT aggregate_id) as unique_aggregates,
    AVG(COUNT(*)) OVER (PARTITION BY aggregate_id) as avg_events_per_aggregate
  FROM event_store
  WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY aggregate_type, event_type
),

snapshot_opportunities AS (
  SELECT 
    aggregate_id,
    COUNT(*) as event_count,
    MAX(version) as latest_version,
    MIN(event_timestamp) as first_event,
    MAX(event_timestamp) as last_event,
    
    -- Calculate if snapshot would be beneficial
    CASE 
      WHEN COUNT(*) > 100 THEN 'high_priority'
      WHEN COUNT(*) > 50 THEN 'medium_priority'
      WHEN COUNT(*) > 20 THEN 'low_priority'
      ELSE 'not_needed'
    END as snapshot_priority,
    
    -- Estimate performance improvement
    ROUND((COUNT(*) / 100.0) * 100, 0) as estimated_replay_time_reduction_percent
    
  FROM event_store
  WHERE aggregate_id NOT IN (
    SELECT DISTINCT aggregate_id FROM aggregate_snapshots
  )
  GROUP BY aggregate_id
  HAVING COUNT(*) > 20
)

SELECT 
  'Event Store Optimization Report' as report_type,
  
  -- Performance statistics
  JSON_OBJECT(
    'total_event_types', (SELECT COUNT(DISTINCT event_type) FROM event_store_stats),
    'avg_event_size_bytes', (SELECT ROUND(AVG(avg_event_size)::NUMERIC, 0) FROM event_store_stats),
    'largest_aggregate_event_count', (SELECT MAX(event_count) FROM (
      SELECT aggregate_id, COUNT(*) as event_count FROM event_store GROUP BY aggregate_id
    ) agg_counts),
    'events_per_aggregate_avg', (SELECT AVG(unique_aggregates) FROM event_store_stats)
  ) as performance_stats,
  
  -- Snapshot recommendations
  JSON_OBJECT(
    'aggregates_needing_snapshots', (SELECT COUNT(*) FROM snapshot_opportunities),
    'high_priority_snapshots', (SELECT COUNT(*) FROM snapshot_opportunities WHERE snapshot_priority = 'high_priority'),
    'total_events_in_non_snapshotted_aggregates', (SELECT SUM(event_count) FROM snapshot_opportunities),
    'estimated_total_performance_improvement', (
      SELECT CONCAT(AVG(estimated_replay_time_reduction_percent), '%') 
      FROM snapshot_opportunities 
      WHERE snapshot_priority IN ('high_priority', 'medium_priority')
    )
  ) as snapshot_recommendations,
  
  -- Storage optimization insights
  CASE 
    WHEN (SELECT AVG(avg_event_size) FROM event_store_stats) > 10240 THEN 'Consider event data compression'
    WHEN (SELECT COUNT(*) FROM event_store WHERE event_timestamp < CURRENT_TIMESTAMP - INTERVAL '1 year') > 100000 THEN 'Consider archiving old events'
    WHEN (SELECT COUNT(*) FROM snapshot_opportunities WHERE snapshot_priority = 'high_priority') > 10 THEN 'Immediate snapshot creation recommended'
    ELSE 'Event store operating within optimal parameters'
  END as primary_recommendation;

-- Real-time event sourcing monitoring
CREATE VIEW event_sourcing_health_monitor AS
WITH real_time_metrics AS (
  SELECT 
    CURRENT_TIMESTAMP as monitor_timestamp,
    
    -- Recent event activity (last 5 minutes)
    (SELECT COUNT(*) FROM event_store 
     WHERE stored_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as recent_events,
     
    -- Command processing rate
    (SELECT COUNT(*) FROM event_store 
     WHERE stored_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute') as events_last_minute,
     
    -- Aggregate activity
    (SELECT COUNT(DISTINCT aggregate_id) FROM event_store 
     WHERE stored_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as active_aggregates,
     
    -- System load indicators
    (SELECT COUNT(*) FROM event_store 
     WHERE event_type = 'FundsDebited' 
     AND stored_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as financial_events_recent,
     
    -- Error indicators (assuming error events are stored)
    (SELECT COUNT(*) FROM event_store 
     WHERE event_type LIKE '%Error%' 
     AND stored_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as recent_errors,
     
    -- Saga health (pending transfers)
    (SELECT COUNT(*) FROM (
      SELECT transfer_id 
      FROM event_store 
      WHERE event_type = 'FundsDebited' 
      AND stored_at >= CURRENT_TIMESTAMP - INTERVAL '10 minutes'
      AND JSON_EXTRACT(event_data, '$.transferId') NOT IN (
        SELECT JSON_EXTRACT(event_data, '$.transferId')
        FROM event_store 
        WHERE event_type = 'FundsCredited'
        AND stored_at >= CURRENT_TIMESTAMP - INTERVAL '10 minutes'
      )
    ) pending) as pending_transfers
)

SELECT 
  monitor_timestamp,
  recent_events,
  events_last_minute,
  active_aggregates,
  financial_events_recent,
  recent_errors,
  pending_transfers,
  
  -- System health indicators
  CASE 
    WHEN events_last_minute > 100 THEN 'high_throughput'
    WHEN events_last_minute > 20 THEN 'normal_throughput'
    WHEN events_last_minute > 0 THEN 'low_throughput'
    ELSE 'idle'
  END as throughput_status,
  
  CASE 
    WHEN recent_errors > 0 THEN 'error_detected'
    WHEN pending_transfers > 10 THEN 'saga_backlog'
    WHEN events_last_minute = 0 AND EXTRACT(HOUR FROM CURRENT_TIMESTAMP) BETWEEN 9 AND 17 THEN 'potentially_idle'
    ELSE 'healthy'
  END as system_health,
  
  -- Performance indicators
  ROUND(events_last_minute / 60.0, 2) as events_per_second,
  ROUND(financial_events_recent / GREATEST(recent_events, 1) * 100, 1) as financial_event_percentage

FROM real_time_metrics;

-- QueryLeaf provides comprehensive MongoDB event sourcing capabilities:
-- 1. Complete event store management with SQL-familiar syntax  
-- 2. Advanced aggregate reconstruction using window functions and temporal queries
-- 3. Sophisticated audit trail analysis with compliance reporting
-- 4. Complex business process tracking through correlation and saga patterns
-- 5. Real-time monitoring and health assessment capabilities
-- 6. Performance optimization insights including snapshot recommendations
-- 7. Risk assessment and fraud detection through event pattern analysis
-- 8. Regulatory compliance support with comprehensive audit capabilities
-- 9. Integration with MongoDB's native performance and indexing capabilities
-- 10. Familiar SQL patterns for complex event sourcing operations and CQRS implementations
```

## Best Practices for Production Event Sourcing and CQRS

### Event Store Design and Performance Optimization

Essential principles for scalable MongoDB event sourcing implementations:

1. **Event Design**: Create immutable, self-contained events with complete business context and metadata
2. **Indexing Strategy**: Implement comprehensive indexing for aggregate lookup, temporal queries, and compliance auditing
3. **Snapshot Management**: Design efficient snapshot strategies to optimize aggregate reconstruction performance
4. **Schema Evolution**: Plan for event schema versioning and backward compatibility as business rules evolve
5. **Security Integration**: Implement encryption, access controls, and audit logging for sensitive event data
6. **Performance Monitoring**: Deploy comprehensive metrics for event throughput, aggregate health, and saga performance

### CQRS Read Model Optimization

Design efficient read models for complex query requirements:

1. **Read Model Strategy**: Create specialized read models optimized for specific query patterns and user interfaces
2. **Eventual Consistency**: Implement robust event processing for read model updates with proper error handling
3. **Caching Integration**: Add intelligent caching layers for frequently accessed read model data
4. **Analytics Support**: Design read models that support business intelligence and regulatory reporting requirements
5. **Scalability Planning**: Plan read model distribution and replication for high-availability query processing
6. **Business Intelligence**: Integrate with analytics tools for comprehensive business insights from event data

## Conclusion

MongoDB Event Sourcing and CQRS provide enterprise-grade architectural patterns that enable building resilient, auditable, and scalable distributed systems with complete business context preservation and sophisticated query capabilities. The combination of immutable event storage, aggregate reconstruction, and command-query separation creates robust systems that naturally support complex business processes, regulatory compliance, and distributed system consistency requirements.

Key MongoDB Event Sourcing advantages include:

- **Complete Audit Trails**: Immutable event storage provides comprehensive business history and regulatory compliance support
- **Distributed Consistency**: Event-driven architecture enables eventual consistency across microservices boundaries
- **Business Logic Preservation**: Events capture complete business context and decision-making information
- **Performance Optimization**: Specialized read models and aggregate snapshots provide efficient query processing
- **Scalability Support**: Independent scaling of command and query processing with MongoDB's distributed capabilities
- **SQL Accessibility**: Familiar SQL-style operations through QueryLeaf for event sourcing and CQRS management

Whether you're building financial systems, e-commerce platforms, compliance-sensitive applications, or complex distributed architectures requiring complete auditability, MongoDB Event Sourcing with QueryLeaf's SQL interface provides the foundation for reliable, scalable, and maintainable systems that preserve business context while enabling sophisticated query and analysis capabilities.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-style event sourcing and CQRS operations into MongoDB's native aggregation pipelines and indexing strategies, making advanced event-driven architectures accessible to SQL-oriented development teams. Complex event replay scenarios, aggregate reconstruction, compliance reporting, and read model management are seamlessly handled through familiar SQL constructs, enabling sophisticated distributed system patterns without requiring deep MongoDB event sourcing expertise.

The combination of MongoDB's powerful event storage and aggregation capabilities with SQL-familiar event sourcing operations creates an ideal platform for applications requiring both sophisticated audit capabilities and familiar database interaction patterns, ensuring your event-driven systems can evolve and scale efficiently while maintaining complete business context and regulatory compliance.