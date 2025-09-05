---
title: "MongoDB Multi-Document Transactions and ACID Operations: Ensuring Data Consistency with SQL-Style Transaction Management"
description: "Master MongoDB multi-document transactions for maintaining data consistency. Learn ACID properties, transaction isolation, error handling, and SQL-style transaction patterns for complex operations."
date: 2025-09-04
tags: [mongodb, transactions, acid, data-consistency, sql, isolation]
---

# MongoDB Multi-Document Transactions and ACID Operations: Ensuring Data Consistency with SQL-Style Transaction Management

Modern applications often require complex operations that span multiple documents and collections while maintaining strict data consistency guarantees. Whether you're processing financial transactions, managing inventory updates, or coordinating multi-step business workflows, ensuring that related operations either all succeed or all fail together is critical for data integrity.

MongoDB's multi-document transactions provide ACID (Atomicity, Consistency, Isolation, Durability) guarantees that enable complex operations while maintaining data consistency. Combined with SQL-style transaction management patterns, MongoDB transactions offer familiar transaction semantics while leveraging MongoDB's document model advantages.

## The Data Consistency Challenge

Without transactions, coordinating multiple related operations can lead to inconsistent data states:

```sql
-- SQL without transaction - potential inconsistency
-- Transfer money between accounts
UPDATE accounts SET balance = balance - 100 WHERE account_id = 'A';
-- If this fails, first update is already committed
UPDATE accounts SET balance = balance + 100 WHERE account_id = 'B';

-- Problems without transactions:
-- - Partial updates leave data inconsistent
-- - Concurrent operations can cause race conditions
-- - No atomicity guarantees across operations
-- - Difficult error recovery
```

MongoDB multi-document transactions solve these problems:

```javascript
// MongoDB multi-document transaction
const session = client.startSession();

try {
  await session.withTransaction(async () => {
    // All operations in this block are atomic
    await accounts.updateOne(
      { account_id: 'A' },
      { $inc: { balance: -100 } },
      { session }
    );
    
    await accounts.updateOne(
      { account_id: 'B' },
      { $inc: { balance: 100 } },
      { session }
    );
    
    // Log transaction for audit
    await transaction_log.insertOne({
      type: 'transfer',
      from_account: 'A',
      to_account: 'B',
      amount: 100,
      timestamp: new Date()
    }, { session });
  });
  
  console.log('Transfer completed successfully');
} catch (error) {
  console.error('Transfer failed, all changes rolled back:', error);
} finally {
  await session.endSession();
}

// Benefits:
// - All operations succeed or fail together (Atomicity)
// - Data remains consistent throughout (Consistency)
// - Concurrent transactions don't interfere (Isolation)
// - Changes are permanently stored on success (Durability)
```

## Understanding MongoDB Transactions

### Transaction Basics

MongoDB transactions work across replica sets and sharded clusters:

```javascript
// Basic transaction structure
class TransactionManager {
  constructor(client) {
    this.client = client;
  }

  async executeTransaction(operations, options = {}) {
    const session = this.client.startSession();
    
    try {
      const transactionOptions = {
        readPreference: 'primary',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority', j: true },
        maxCommitTimeMS: 30000,
        ...options
      };

      const result = await session.withTransaction(async () => {
        const results = [];
        
        for (const operation of operations) {
          const result = await this.executeOperation(operation, session);
          results.push(result);
        }
        
        return results;
      }, transactionOptions);

      return { success: true, results: result };
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        errorCode: error.code
      };
    } finally {
      await session.endSession();
    }
  }

  async executeOperation(operation, session) {
    const { type, collection, filter, update, document } = operation;
    
    switch (type) {
      case 'insertOne':
        return await this.client.db().collection(collection)
          .insertOne(document, { session });
        
      case 'updateOne':
        return await this.client.db().collection(collection)
          .updateOne(filter, update, { session });
        
      case 'deleteOne':
        return await this.client.db().collection(collection)
          .deleteOne(filter, { session });
        
      case 'findOneAndUpdate':
        return await this.client.db().collection(collection)
          .findOneAndUpdate(filter, update, { 
            session, 
            returnDocument: 'after' 
          });
        
      default:
        throw new Error(`Unsupported operation type: ${type}`);
    }
  }
}

// Usage example
const txManager = new TransactionManager(client);

const transferOperations = [
  {
    type: 'updateOne',
    collection: 'accounts',
    filter: { account_id: 'A', balance: { $gte: 100 } },
    update: { $inc: { balance: -100 } }
  },
  {
    type: 'updateOne', 
    collection: 'accounts',
    filter: { account_id: 'B' },
    update: { $inc: { balance: 100 } }
  },
  {
    type: 'insertOne',
    collection: 'transaction_log',
    document: {
      type: 'transfer',
      from_account: 'A',
      to_account: 'B', 
      amount: 100,
      timestamp: new Date()
    }
  }
];

const result = await txManager.executeTransaction(transferOperations);
```

### ACID Properties in MongoDB

MongoDB transactions provide full ACID guarantees:

```javascript
// Demonstrating ACID properties
class ECommerceTransactionManager {
  constructor(db) {
    this.db = db;
    this.orders = db.collection('orders');
    this.inventory = db.collection('inventory');
    this.customers = db.collection('customers');
    this.payments = db.collection('payments');
  }

  // Atomicity: All operations succeed or fail together
  async processOrder(orderData, paymentData) {
    const session = this.db.client.startSession();
    
    try {
      await session.withTransaction(async () => {
        // 1. Create order
        const orderResult = await this.orders.insertOne(orderData, { session });
        const orderId = orderResult.insertedId;

        // 2. Update inventory for all items
        for (const item of orderData.items) {
          const inventoryUpdate = await this.inventory.updateOne(
            { 
              product_id: item.product_id,
              quantity: { $gte: item.quantity }
            },
            { 
              $inc: { quantity: -item.quantity },
              $push: {
                reservations: {
                  order_id: orderId,
                  quantity: item.quantity,
                  timestamp: new Date()
                }
              }
            },
            { session }
          );

          if (inventoryUpdate.modifiedCount === 0) {
            throw new Error(`Insufficient inventory for product ${item.product_id}`);
          }
        }

        // 3. Process payment
        const paymentRecord = {
          ...paymentData,
          order_id: orderId,
          status: 'completed',
          processed_at: new Date()
        };
        
        await this.payments.insertOne(paymentRecord, { session });

        // 4. Update customer order history
        await this.customers.updateOne(
          { _id: orderData.customer_id },
          { 
            $push: { 
              order_history: orderId 
            },
            $inc: { 
              total_orders: 1,
              lifetime_value: orderData.total_amount
            }
          },
          { session }
        );

        return orderId;
      });

      return { success: true, orderId };
      
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await session.endSession();
    }
  }

  // Consistency: Data remains valid throughout the transaction
  async transferInventoryBetweenWarehouses(fromWarehouse, toWarehouse, transfers) {
    const session = this.db.client.startSession();
    
    try {
      await session.withTransaction(async () => {
        let totalValueTransferred = 0;

        for (const transfer of transfers) {
          // Validate source warehouse has sufficient inventory
          const sourceInventory = await this.inventory.findOne({
            warehouse_id: fromWarehouse,
            product_id: transfer.product_id,
            quantity: { $gte: transfer.quantity }
          }, { session });

          if (!sourceInventory) {
            throw new Error(
              `Insufficient inventory for product ${transfer.product_id} in warehouse ${fromWarehouse}`
            );
          }

          // Calculate transfer value for consistency check
          totalValueTransferred += sourceInventory.unit_cost * transfer.quantity;

          // Remove from source warehouse
          await this.inventory.updateOne(
            { 
              warehouse_id: fromWarehouse,
              product_id: transfer.product_id
            },
            { 
              $inc: { quantity: -transfer.quantity }
            },
            { session }
          );

          // Add to destination warehouse
          await this.inventory.updateOne(
            {
              warehouse_id: toWarehouse,
              product_id: transfer.product_id
            },
            {
              $inc: { quantity: transfer.quantity }
            },
            { 
              session,
              upsert: true
            }
          );
        }

        // Record transfer transaction for audit
        await this.db.collection('inventory_transfers').insertOne({
          from_warehouse: fromWarehouse,
          to_warehouse: toWarehouse,
          transfers: transfers,
          total_value: totalValueTransferred,
          timestamp: new Date(),
          status: 'completed'
        }, { session });

        // Update warehouse totals (consistency validation)
        const fromWarehouseTotal = await this.inventory.aggregate([
          { $match: { warehouse_id: fromWarehouse } },
          { $group: { _id: null, total_value: { $sum: { $multiply: ['$quantity', '$unit_cost'] } } } }
        ], { session }).toArray();

        const toWarehouseTotal = await this.inventory.aggregate([
          { $match: { warehouse_id: toWarehouse } },
          { $group: { _id: null, total_value: { $sum: { $multiply: ['$quantity', '$unit_cost'] } } } }
        ], { session }).toArray();

        // Update warehouse summary records
        await this.db.collection('warehouse_summaries').updateOne(
          { warehouse_id: fromWarehouse },
          { 
            $set: { 
              total_inventory_value: fromWarehouseTotal[0]?.total_value || 0,
              last_updated: new Date()
            }
          },
          { session, upsert: true }
        );

        await this.db.collection('warehouse_summaries').updateOne(
          { warehouse_id: toWarehouse },
          { 
            $set: { 
              total_inventory_value: toWarehouseTotal[0]?.total_value || 0,
              last_updated: new Date()
            }
          },
          { session, upsert: true }
        );
      });

      return { success: true };
      
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await session.endSession();
    }
  }
}
```

## Advanced Transaction Patterns

### Isolation Levels and Read Concerns

Configure transaction isolation for different consistency requirements:

```javascript
// Transaction isolation configuration
class IsolationManager {
  constructor(client) {
    this.client = client;
  }

  // Read Committed isolation (default)
  async readCommittedTransaction(operations) {
    const session = this.client.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        return await this.executeOperations(operations, session);
      }, {
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority', j: true }
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  // Snapshot isolation for consistent reads
  async snapshotTransaction(operations) {
    const session = this.client.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        return await this.executeOperations(operations, session);
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true }
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  // Linearizable reads for strongest consistency
  async linearizableTransaction(operations) {
    const session = this.client.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        return await this.executeOperations(operations, session);
      }, {
        readConcern: { level: 'linearizable' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary'
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  async executeOperations(operations, session) {
    const results = [];
    
    for (const op of operations) {
      const collection = this.client.db().collection(op.collection);
      
      switch (op.type) {
        case 'find':
          const docs = await collection.find(op.filter, { session }).toArray();
          results.push(docs);
          break;
          
        case 'aggregate':
          const aggregated = await collection.aggregate(op.pipeline, { session }).toArray();
          results.push(aggregated);
          break;
          
        case 'updateOne':
          const updateResult = await collection.updateOne(op.filter, op.update, { session });
          results.push(updateResult);
          break;
      }
    }
    
    return results;
  }
}

// Usage examples for different isolation levels
const isolationManager = new IsolationManager(client);

// Financial reporting requiring snapshot isolation
const reportOperations = [
  {
    type: 'aggregate',
    collection: 'orders',
    pipeline: [
      { $match: { created_at: { $gte: new Date('2025-09-01') } } },
      { $group: { _id: null, total_revenue: { $sum: '$total_amount' } } }
    ]
  },
  {
    type: 'aggregate',
    collection: 'payments',
    pipeline: [
      { $match: { processed_at: { $gte: new Date('2025-09-01') } } },
      { $group: { _id: null, total_processed: { $sum: '$amount' } } }
    ]
  }
];

const reportResults = await isolationManager.snapshotTransaction(reportOperations);
```

### Transaction Retry Logic

Implement robust retry mechanisms for transaction conflicts:

```javascript
// Transaction retry with exponential backoff
class RetryableTransactionManager {
  constructor(client, options = {}) {
    this.client = client;
    this.maxRetries = options.maxRetries || 3;
    this.baseDelayMs = options.baseDelayMs || 100;
    this.maxDelayMs = options.maxDelayMs || 5000;
  }

  async executeWithRetry(transactionFn, options = {}) {
    let attempt = 0;
    
    while (attempt <= this.maxRetries) {
      const session = this.client.startSession();
      
      try {
        const result = await session.withTransaction(async () => {
          return await transactionFn(session);
        }, {
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority', j: true },
          maxCommitTimeMS: 30000,
          ...options
        });

        return { success: true, result, attempts: attempt + 1 };
        
      } catch (error) {
        attempt++;
        
        // Check if error is retryable
        if (this.isRetryableError(error) && attempt <= this.maxRetries) {
          const delay = Math.min(
            this.baseDelayMs * Math.pow(2, attempt - 1),
            this.maxDelayMs
          );
          
          console.log(`Transaction failed (attempt ${attempt}), retrying in ${delay}ms: ${error.message}`);
          await this.sleep(delay);
          
        } else {
          return { 
            success: false, 
            error: error.message,
            errorCode: error.code,
            attempts: attempt
          };
        }
      } finally {
        await session.endSession();
      }
    }
  }

  isRetryableError(error) {
    // MongoDB retryable error codes
    const retryableCodes = [
      112, // WriteConflict
      117, // ConflictingOperationInProgress
      121, // DocumentValidationFailure
      125, // InvalidIdField
      133, // FailedToParse
      202, // NamespaceNotFound
      211, // NamespaceExists
      225, // InvalidNamespace
      251, // NoSuchTransaction
      256, // TransactionCoordinatorSteppingDown
      257, // TransactionCoordinatorReachedAbortDecision
    ];

    return retryableCodes.includes(error.code) || 
           error.hasErrorLabel('TransientTransactionError') ||
           error.hasErrorLabel('UnknownTransactionCommitResult');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage example with automatic retry
const retryManager = new RetryableTransactionManager(client);

const result = await retryManager.executeWithRetry(async (session) => {
  // Complex multi-collection operation
  const order = await db.collection('orders').findOneAndUpdate(
    { _id: orderId, status: 'pending' },
    { $set: { status: 'processing', processing_started: new Date() } },
    { session, returnDocument: 'after' }
  );

  if (!order.value) {
    throw new Error('Order not found or already processed');
  }

  // Update inventory
  for (const item of order.value.items) {
    const inventoryResult = await db.collection('inventory').updateOne(
      { product_id: item.product_id, quantity: { $gte: item.quantity } },
      { $inc: { quantity: -item.quantity, reserved: item.quantity } },
      { session }
    );

    if (inventoryResult.modifiedCount === 0) {
      throw new Error(`Insufficient inventory for ${item.product_id}`);
    }
  }

  // Create shipment record
  await db.collection('shipments').insertOne({
    order_id: orderId,
    items: order.value.items,
    status: 'preparing',
    created_at: new Date()
  }, { session });

  return order.value;
});

if (result.success) {
  console.log(`Order processed successfully after ${result.attempts} attempts`);
} else {
  console.error(`Order processing failed after ${result.attempts} attempts: ${result.error}`);
}
```

## Complex Transaction Scenarios

### Multi-Step Business Workflows

Implement complex business processes with transactions:

```javascript
// Multi-step subscription management workflow
class SubscriptionManager {
  constructor(db) {
    this.db = db;
  }

  async upgradeSubscription(userId, newPlanId, paymentMethodId) {
    const session = this.db.client.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        // 1. Get current subscription
        const currentSubscription = await this.db.collection('subscriptions').findOne(
          { user_id: userId, status: 'active' },
          { session }
        );

        if (!currentSubscription) {
          throw new Error('No active subscription found');
        }

        // 2. Get new plan details
        const newPlan = await this.db.collection('subscription_plans').findOne(
          { _id: newPlanId, active: true },
          { session }
        );

        if (!newPlan) {
          throw new Error('Invalid subscription plan');
        }

        // 3. Calculate prorated charge
        const prorationAmount = this.calculateProration(currentSubscription, newPlan);
        
        // 4. Process payment if upgrade requires additional payment
        let paymentRecord = null;
        if (prorationAmount > 0) {
          paymentRecord = await this.processProrationPayment(
            userId, paymentMethodId, prorationAmount, session
          );
        }

        // 5. Update current subscription to cancelled
        await this.db.collection('subscriptions').updateOne(
          { _id: currentSubscription._id },
          { 
            $set: { 
              status: 'cancelled',
              cancelled_at: new Date(),
              cancellation_reason: 'upgraded'
            }
          },
          { session }
        );

        // 6. Create new subscription
        const newSubscription = {
          user_id: userId,
          plan_id: newPlanId,
          status: 'active',
          started_at: new Date(),
          current_period_start: new Date(),
          current_period_end: this.calculatePeriodEnd(newPlan),
          payment_method_id: paymentMethodId,
          amount: newPlan.price
        };

        const subscriptionResult = await this.db.collection('subscriptions').insertOne(
          newSubscription,
          { session }
        );

        // 7. Update user account
        await this.db.collection('users').updateOne(
          { _id: userId },
          { 
            $set: { 
              current_plan_id: newPlanId,
              plan_updated_at: new Date()
            },
            $push: {
              subscription_history: {
                action: 'upgrade',
                from_plan: currentSubscription.plan_id,
                to_plan: newPlanId,
                timestamp: new Date(),
                proration_amount: prorationAmount
              }
            }
          },
          { session }
        );

        // 8. Log activity
        await this.db.collection('activity_log').insertOne({
          user_id: userId,
          action: 'subscription_upgrade',
          details: {
            old_plan: currentSubscription.plan_id,
            new_plan: newPlanId,
            proration_amount: prorationAmount,
            payment_id: paymentRecord?._id
          },
          timestamp: new Date()
        }, { session });

        return {
          subscription_id: subscriptionResult.insertedId,
          proration_amount: prorationAmount,
          payment_id: paymentRecord?._id
        };
      });

      return { success: true, ...result };
      
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await session.endSession();
    }
  }

  calculateProration(currentSubscription, newPlan) {
    const now = new Date();
    const periodEnd = new Date(currentSubscription.current_period_end);
    const periodStart = new Date(currentSubscription.current_period_start);
    
    // Calculate remaining time in current period
    const remainingDays = Math.max(0, Math.ceil((periodEnd - now) / (24 * 60 * 60 * 1000)));
    const totalDays = Math.ceil((periodEnd - periodStart) / (24 * 60 * 60 * 1000));
    
    // Current plan daily rate
    const currentDailyRate = currentSubscription.amount / totalDays;
    const currentRemaining = currentDailyRate * remainingDays;
    
    // New plan daily rate
    const newDailyRate = newPlan.price / 30; // Assuming monthly plans
    const newRemaining = newDailyRate * remainingDays;
    
    return Math.max(0, newRemaining - currentRemaining);
  }

  async processProrationPayment(userId, paymentMethodId, amount, session) {
    const paymentRecord = {
      user_id: userId,
      payment_method_id: paymentMethodId,
      amount: amount,
      type: 'proration',
      status: 'completed',
      processed_at: new Date()
    };

    const result = await this.db.collection('payments').insertOne(paymentRecord, { session });
    return { ...paymentRecord, _id: result.insertedId };
  }

  calculatePeriodEnd(plan) {
    const now = new Date();
    switch (plan.billing_period) {
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      case 'yearly':
        return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      default:
        throw new Error('Unsupported billing period');
    }
  }
}
```

### Distributed Transaction Coordination

Coordinate transactions across multiple databases or services:

```javascript
// Two-phase commit pattern for distributed transactions
class DistributedTransactionCoordinator {
  constructor(databases) {
    this.databases = databases; // Map of database connections
    this.transactionLog = null;
  }

  async executeDistributedTransaction(operations) {
    const transactionId = this.generateTransactionId();
    const participants = Object.keys(operations);
    
    try {
      // Phase 1: Prepare phase
      console.log(`Starting distributed transaction ${transactionId}`);
      
      const prepareResults = await this.preparePhase(transactionId, operations);
      
      if (prepareResults.every(result => result.success)) {
        // Phase 2: Commit phase
        const commitResults = await this.commitPhase(transactionId, participants);
        
        if (commitResults.every(result => result.success)) {
          await this.logTransaction(transactionId, 'committed', operations);
          return { success: true, transactionId };
        } else {
          // Partial commit failure - need manual intervention
          await this.logTransaction(transactionId, 'partially_committed', operations, commitResults);
          throw new Error('Partial commit failure - manual intervention required');
        }
      } else {
        // Prepare phase failed - abort transaction
        await this.abortPhase(transactionId, participants);
        await this.logTransaction(transactionId, 'aborted', operations, prepareResults);
        throw new Error('Transaction aborted due to prepare phase failure');
      }
      
    } catch (error) {
      await this.abortPhase(transactionId, participants);
      await this.logTransaction(transactionId, 'failed', operations, null, error);
      throw error;
    }
  }

  async preparePhase(transactionId, operations) {
    const results = [];
    
    for (const [dbName, dbOperations] of Object.entries(operations)) {
      const db = this.databases[dbName];
      const session = db.client.startSession();
      
      try {
        // Start transaction and execute operations
        await session.startTransaction({
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority', j: true }
        });

        for (const operation of dbOperations) {
          await this.executeOperation(db, operation, session);
        }

        // Prepare: keep transaction open but don't commit
        await this.recordParticipantState(transactionId, dbName, 'prepared', session);
        
        results.push({ 
          participant: dbName, 
          success: true, 
          session: session 
        });
        
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
        
        results.push({ 
          participant: dbName, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    return results;
  }

  async commitPhase(transactionId, participants) {
    const results = [];
    
    for (const participant of participants) {
      try {
        const participantState = await this.getParticipantState(transactionId, participant);
        
        if (participantState.session) {
          await participantState.session.commitTransaction();
          await participantState.session.endSession();
          
          await this.recordParticipantState(transactionId, participant, 'committed');
          results.push({ participant, success: true });
        }
      } catch (error) {
        results.push({ participant, success: false, error: error.message });
      }
    }
    
    return results;
  }

  async abortPhase(transactionId, participants) {
    for (const participant of participants) {
      try {
        const participantState = await this.getParticipantState(transactionId, participant);
        
        if (participantState.session) {
          await participantState.session.abortTransaction();
          await participantState.session.endSession();
        }
        
        await this.recordParticipantState(transactionId, participant, 'aborted');
      } catch (error) {
        console.error(`Failed to abort transaction for participant ${participant}:`, error);
      }
    }
  }

  generateTransactionId() {
    return `dtx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## QueryLeaf Transaction Integration

QueryLeaf provides SQL-familiar syntax for MongoDB transactions:

```sql
-- QueryLeaf transaction syntax
BEGIN TRANSACTION;

-- Transfer funds between accounts
UPDATE accounts 
SET balance = balance - 100,
    last_modified = CURRENT_TIMESTAMP
WHERE account_id = 'A' 
  AND balance >= 100;

-- Check if update affected exactly one row
IF @@ROWCOUNT != 1
BEGIN
    ROLLBACK TRANSACTION;
    RAISERROR('Insufficient funds or account not found', 16, 1);
    RETURN;
END

UPDATE accounts
SET balance = balance + 100,
    last_modified = CURRENT_TIMESTAMP  
WHERE account_id = 'B';

-- Log the transaction
INSERT INTO transaction_log (
    transaction_type,
    from_account,
    to_account,
    amount,
    timestamp,
    status
) VALUES (
    'transfer',
    'A',
    'B', 
    100,
    CURRENT_TIMESTAMP,
    'completed'
);

COMMIT TRANSACTION;

-- QueryLeaf automatically translates this to:
-- 1. MongoDB session.withTransaction()
-- 2. Proper error handling and rollback
-- 3. ACID compliance with MongoDB transactions
-- 4. Optimal read/write concerns

-- Advanced transaction patterns
WITH order_processing AS (
    -- Complex multi-table transaction
    BEGIN TRANSACTION ISOLATION LEVEL SNAPSHOT;
    
    -- Create order
    INSERT INTO orders (customer_id, total_amount, status, created_at)
    VALUES (@customer_id, @total_amount, 'pending', CURRENT_TIMESTAMP);
    
    SET @order_id = SCOPE_IDENTITY();
    
    -- Update inventory for each item
    UPDATE inventory 
    SET quantity = quantity - oi.quantity,
        reserved = reserved + oi.quantity
    FROM inventory i
    INNER JOIN @order_items oi ON i.product_id = oi.product_id
    WHERE i.quantity >= oi.quantity;
    
    -- Verify all items were updated
    IF @@ROWCOUNT != (SELECT COUNT(*) FROM @order_items)
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Insufficient inventory for one or more items', 16, 1);
        RETURN;
    END
    
    -- Process payment
    INSERT INTO payments (order_id, amount, status, processed_at)
    VALUES (@order_id, @total_amount, 'completed', CURRENT_TIMESTAMP);
    
    COMMIT TRANSACTION;
    
    SELECT @order_id as order_id;
),

-- Real-time inventory management with transactions  
inventory_transfer AS (
    BEGIN TRANSACTION READ COMMITTED;
    
    -- Transfer inventory between warehouses
    DECLARE @transfer_value DECIMAL(15,2) = 0;
    
    -- Calculate total transfer value
    SELECT @transfer_value = SUM(quantity * unit_cost)
    FROM inventory 
    WHERE warehouse_id = @from_warehouse
      AND product_id IN (SELECT product_id FROM @transfer_items);
    
    -- Remove from source
    UPDATE inventory
    SET quantity = quantity - ti.quantity
    FROM inventory i
    INNER JOIN @transfer_items ti ON i.product_id = ti.product_id
    WHERE i.warehouse_id = @from_warehouse
      AND i.quantity >= ti.quantity;
    
    -- Add to destination  
    INSERT INTO inventory (warehouse_id, product_id, quantity, unit_cost)
    SELECT @to_warehouse, ti.product_id, ti.quantity, i.unit_cost
    FROM @transfer_items ti
    INNER JOIN inventory i ON ti.product_id = i.product_id
    WHERE i.warehouse_id = @from_warehouse
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET 
        quantity = inventory.quantity + EXCLUDED.quantity;
    
    -- Log transfer
    INSERT INTO inventory_transfers (
        from_warehouse,
        to_warehouse, 
        transfer_value,
        items_transferred,
        timestamp
    ) VALUES (
        @from_warehouse,
        @to_warehouse,
        @transfer_value,
        (SELECT COUNT(*) FROM @transfer_items),
        CURRENT_TIMESTAMP
    );
    
    COMMIT TRANSACTION;
)

-- QueryLeaf provides:
-- 1. Familiar SQL transaction syntax
-- 2. Automatic MongoDB session management
-- 3. Proper isolation level mapping
-- 4. Error handling and rollback logic
-- 5. Performance optimization for MongoDB
-- 6. Multi-collection transaction coordination
```

## Best Practices for MongoDB Transactions

### Performance Optimization

Optimize transaction performance for production workloads:

1. **Keep Transactions Short**: Minimize transaction duration to reduce lock contention
2. **Batch Operations**: Group related operations within single transactions
3. **Appropriate Isolation**: Use the lowest isolation level that meets consistency requirements
4. **Index Strategy**: Ensure proper indexes for transaction queries
5. **Connection Management**: Use connection pooling and limit concurrent transactions
6. **Monitoring**: Track transaction metrics and performance

### Error Handling Guidelines

Implement robust error handling for production transactions:

1. **Retry Logic**: Implement exponential backoff for transient errors
2. **Timeout Configuration**: Set appropriate transaction timeouts
3. **Deadlock Prevention**: Order operations consistently to avoid deadlocks
4. **Logging**: Comprehensive transaction logging for debugging
5. **Recovery Planning**: Plan for partial failure scenarios
6. **Testing**: Test transaction behavior under concurrent load

## Conclusion

MongoDB multi-document transactions provide ACID guarantees that enable complex operations while maintaining data consistency. Combined with SQL-familiar transaction patterns, MongoDB transactions offer robust data integrity features while leveraging the flexibility of the document model.

Key transaction benefits include:

- **Data Integrity**: ACID compliance ensures consistent data states
- **Complex Operations**: Coordinate multi-document and multi-collection operations  
- **Error Recovery**: Automatic rollback on failures prevents partial updates
- **Isolation Control**: Configure appropriate isolation levels for different use cases
- **Scalability**: Work across replica sets and sharded clusters

Whether you're building financial applications, e-commerce platforms, or complex business workflows, MongoDB transactions with QueryLeaf's familiar SQL interface provide the tools for maintaining data consistency at scale. This combination enables you to implement sophisticated transactional logic while preserving familiar development patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB sessions, transaction retry logic, and isolation levels while providing SQL-familiar transaction syntax. Complex multi-collection operations, error handling, and performance optimizations are seamlessly translated to efficient MongoDB transaction APIs, making ACID operations both powerful and accessible.

The integration of ACID transactions with SQL-style transaction management makes MongoDB an ideal platform for applications requiring both data consistency guarantees and familiar database interaction patterns, ensuring your transactional operations remain both reliable and maintainable as they scale.