---
title: "MongoDB Concurrent Operations and Race Condition Management: Advanced Multi-User Data Integrity with Optimistic Locking and Conflict Resolution"
description: "Master MongoDB concurrent operations, race condition handling, and multi-user data integrity. Learn optimistic locking, atomic updates, transaction isolation, and conflict resolution patterns for production applications."
date: 2025-10-28
tags: [mongodb, concurrency, race-conditions, locking, transactions, data-integrity, sql, performance]
---

# MongoDB Concurrent Operations and Race Condition Management: Advanced Multi-User Data Integrity with Optimistic Locking and Conflict Resolution

Modern applications face increasing concurrency challenges as user bases grow and systems become more distributed. Multiple users modifying the same data simultaneously, background processes running automated updates, and microservices accessing shared resources create complex race condition scenarios that can lead to data corruption, inconsistent states, and lost updates.

Traditional approaches to concurrency control often rely on pessimistic locking mechanisms that can create bottlenecks, deadlocks, and reduced system throughput. MongoDB's flexible document model and powerful atomic operations provide sophisticated tools for managing concurrent operations while maintaining high performance and data integrity.

## The Concurrency Challenge

Traditional relational databases handle concurrency through locking mechanisms that can limit scalability:

```sql
-- Traditional pessimistic locking approach - blocks other users
BEGIN TRANSACTION;

-- Exclusive lock prevents other transactions from reading/writing
SELECT account_balance 
FROM accounts 
WHERE account_id = 12345 
FOR UPDATE;  -- Blocks all other operations

-- Update after acquiring lock
UPDATE accounts 
SET account_balance = account_balance - 500.00,
    last_transaction = CURRENT_TIMESTAMP
WHERE account_id = 12345;

-- Transaction processing during exclusive lock
INSERT INTO transactions (
    account_id, 
    transaction_type, 
    amount, 
    timestamp
) VALUES (12345, 'withdrawal', -500.00, CURRENT_TIMESTAMP);

COMMIT TRANSACTION;

-- Problems with pessimistic locking:
-- - Reduced concurrency due to blocking
-- - Potential for deadlocks with multiple locks
-- - Performance bottlenecks under high load
-- - Lock timeouts and failed operations
-- - Complex lock hierarchy management
-- - Reduced system scalability
```

MongoDB provides optimistic concurrency control and atomic operations that maintain data integrity without blocking:

```javascript
// MongoDB optimistic concurrency with atomic operations
async function transferFunds(fromAccount, toAccount, amount) {
  const session = client.startSession();
  
  try {
    return await session.withTransaction(async () => {
      // Read current state without locking
      const fromAccountDoc = await db.collection('accounts').findOne(
        { accountId: fromAccount }, 
        { session }
      );
      
      const toAccountDoc = await db.collection('accounts').findOne(
        { accountId: toAccount }, 
        { session }
      );
      
      // Verify sufficient balance
      if (fromAccountDoc.balance < amount) {
        throw new Error('Insufficient funds');
      }
      
      // Atomic update with optimistic concurrency control
      const fromResult = await db.collection('accounts').updateOne(
        { 
          accountId: fromAccount, 
          version: fromAccountDoc.version,  // Optimistic lock
          balance: { $gte: amount }         // Additional safety check
        },
        { 
          $inc: { 
            balance: -amount,
            version: 1                      // Increment version
          },
          $set: { 
            lastModified: new Date(),
            lastTransaction: ObjectId()
          }
        },
        { session }
      );
      
      // Check if update succeeded (no race condition)
      if (fromResult.modifiedCount === 0) {
        throw new Error('Account modified by another operation - retry');
      }
      
      // Atomic credit to destination account
      const toResult = await db.collection('accounts').updateOne(
        { 
          accountId: toAccount,
          version: toAccountDoc.version
        },
        { 
          $inc: { 
            balance: amount,
            version: 1
          },
          $set: { 
            lastModified: new Date(),
            lastTransaction: ObjectId()
          }
        },
        { session }
      );
      
      if (toResult.modifiedCount === 0) {
        throw new Error('Destination account modified - retry');
      }
      
      // Record transaction atomically
      await db.collection('transactions').insertOne({
        transactionId: ObjectId(),
        fromAccount: fromAccount,
        toAccount: toAccount,
        amount: amount,
        timestamp: new Date(),
        status: 'completed',
        sessionId: session.id
      }, { session });
      
      return { success: true, transactionId: ObjectId() };
    });
    
  } catch (error) {
    console.error('Transaction failed:', error.message);
    throw error;
  } finally {
    await session.endSession();
  }
}

// Benefits of optimistic concurrency:
// - High concurrency without blocking
// - No deadlock scenarios
// - Automatic conflict detection and retry
// - Maintains ACID properties through transactions
// - Scalable under high load
// - Flexible conflict resolution strategies
```

## Understanding Concurrent Operations in MongoDB

### Optimistic Locking and Version Control

Implement sophisticated version-based concurrency control:

```javascript
// Advanced optimistic locking system
class OptimisticLockManager {
  constructor(db) {
    this.db = db;
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffFactor: 2
    };
  }
  
  async updateWithOptimisticLock(collection, filter, update, options = {}) {
    const maxRetries = options.maxRetries || this.retryConfig.maxRetries;
    let attempt = 0;
    
    while (attempt <= maxRetries) {
      try {
        // Get current document with version
        const currentDoc = await this.db.collection(collection).findOne(filter);
        
        if (!currentDoc) {
          throw new Error('Document not found');
        }
        
        // Ensure document has version field
        const currentVersion = currentDoc.version || 0;
        
        // Prepare update with version increment
        const versionedUpdate = {
          ...update,
          $inc: {
            ...(update.$inc || {}),
            version: 1
          },
          $set: {
            ...(update.$set || {}),
            lastModified: new Date(),
            modifiedBy: options.userId || 'system'
          }
        };
        
        // Atomic update with version check
        const result = await this.db.collection(collection).updateOne(
          { 
            ...filter,
            version: currentVersion  // Optimistic lock condition
          },
          versionedUpdate,
          options.mongoOptions || {}
        );
        
        if (result.modifiedCount === 0) {
          // Document was modified by another operation
          throw new OptimisticLockError(
            `Document modified by another operation. Expected version: ${currentVersion}`
          );
        }
        
        // Success - return updated document info
        return {
          success: true,
          previousVersion: currentVersion,
          newVersion: currentVersion + 1,
          modifiedCount: result.modifiedCount,
          attempt: attempt + 1
        };
        
      } catch (error) {
        if (error instanceof OptimisticLockError && attempt < maxRetries) {
          // Retry with exponential backoff
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
            this.retryConfig.maxDelay
          );
          
          console.log(`Optimistic lock retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await this.sleep(delay);
          attempt++;
          continue;
        }
        
        // Max retries exceeded or non-retryable error
        throw error;
      }
    }
  }
  
  async updateManyWithOptimisticLock(collection, documents, updateFunction, options = {}) {
    // Batch optimistic locking for multiple documents
    const session = this.db.client.startSession();
    const results = [];
    
    try {
      await session.withTransaction(async () => {
        for (const docFilter of documents) {
          const currentDoc = await this.db.collection(collection).findOne(
            docFilter, 
            { session }
          );
          
          if (!currentDoc) {
            throw new Error(`Document not found: ${JSON.stringify(docFilter)}`);
          }
          
          // Apply update function to get changes
          const update = await updateFunction(currentDoc, docFilter);
          const currentVersion = currentDoc.version || 0;
          
          // Atomic update with version check
          const result = await this.db.collection(collection).updateOne(
            { 
              ...docFilter,
              version: currentVersion
            },
            {
              ...update,
              $inc: {
                ...(update.$inc || {}),
                version: 1
              },
              $set: {
                ...(update.$set || {}),
                lastModified: new Date(),
                batchId: options.batchId || ObjectId()
              }
            },
            { session }
          );
          
          if (result.modifiedCount === 0) {
            throw new OptimisticLockError(
              `Batch update failed - document modified: ${JSON.stringify(docFilter)}`
            );
          }
          
          results.push({
            filter: docFilter,
            previousVersion: currentVersion,
            newVersion: currentVersion + 1,
            success: true
          });
        }
      });
      
      return {
        success: true,
        totalUpdated: results.length,
        results: results
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        partialResults: results
      };
    } finally {
      await session.endSession();
    }
  }
  
  async compareAndSwap(collection, filter, expectedValue, newValue, options = {}) {
    // Compare-and-swap operation for atomic value updates
    const valueField = options.valueField || 'value';
    const versionField = options.versionField || 'version';
    
    const result = await this.db.collection(collection).updateOne(
      {
        ...filter,
        [valueField]: expectedValue,  // Current value must match
        ...(options.expectedVersion && { [versionField]: options.expectedVersion })
      },
      {
        $set: {
          [valueField]: newValue,
          lastModified: new Date(),
          modifiedBy: options.userId || 'system'
        },
        $inc: {
          [versionField]: 1
        }
      }
    );
    
    return {
      success: result.modifiedCount > 0,
      matched: result.matchedCount > 0,
      modified: result.modifiedCount,
      wasExpectedValue: result.matchedCount > 0
    };
  }
  
  async createVersionedDocument(collection, document, options = {}) {
    // Create new document with initial version
    const versionedDoc = {
      ...document,
      version: 1,
      createdAt: new Date(),
      lastModified: new Date(),
      createdBy: options.userId || 'system'
    };
    
    try {
      const result = await this.db.collection(collection).insertOne(
        versionedDoc,
        options.mongoOptions || {}
      );
      
      return {
        success: true,
        documentId: result.insertedId,
        version: 1
      };
    } catch (error) {
      if (error.code === 11000) { // Duplicate key error
        throw new Error('Document already exists with the same unique identifier');
      }
      throw error;
    }
  }
  
  async getDocumentVersion(collection, filter) {
    // Get current document version
    const doc = await this.db.collection(collection).findOne(
      filter, 
      { projection: { version: 1, lastModified: 1 } }
    );
    
    return doc ? {
      exists: true,
      version: doc.version || 0,
      lastModified: doc.lastModified
    } : {
      exists: false,
      version: null,
      lastModified: null
    };
  }
  
  async getVersionHistory(collection, filter, options = {}) {
    // Get version history if audit trail is maintained
    const limit = options.limit || 10;
    const auditCollection = `${collection}_audit`;
    
    const history = await this.db.collection(auditCollection).find(
      filter,
      { 
        sort: { version: -1, timestamp: -1 },
        limit: limit
      }
    ).toArray();
    
    return history;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Custom error class for optimistic locking
class OptimisticLockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}
```

### Atomic Operations and Race Condition Prevention

Implement atomic operations to prevent race conditions:

```javascript
// Advanced atomic operations for race condition prevention
class AtomicOperationManager {
  constructor(db) {
    this.db = db;
    this.operationLog = db.collection('atomic_operations_log');
  }
  
  async atomicIncrement(collection, filter, field, incrementValue = 1, options = {}) {
    // Thread-safe atomic increment with bounds checking
    const session = this.db.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        // Get current value
        const doc = await this.db.collection(collection).findOne(filter, { session });
        
        if (!doc) {
          throw new Error('Document not found for atomic increment');
        }
        
        const currentValue = doc[field] || 0;
        const newValue = currentValue + incrementValue;
        
        // Validate bounds if specified
        if (options.min !== undefined && newValue < options.min) {
          throw new Error(`Increment would violate minimum bound: ${options.min}`);
        }
        
        if (options.max !== undefined && newValue > options.max) {
          throw new Error(`Increment would violate maximum bound: ${options.max}`);
        }
        
        // Atomic increment with bounds checking
        const updateFilter = {
          ...filter,
          [field]: { 
            $gte: options.min || Number.MIN_SAFE_INTEGER,
            $lt: (options.max || Number.MAX_SAFE_INTEGER) - incrementValue + 1
          }
        };
        
        const result = await this.db.collection(collection).updateOne(
          updateFilter,
          {
            $inc: { [field]: incrementValue },
            $set: { 
              lastModified: new Date(),
              lastIncrementBy: incrementValue
            }
          },
          { session }
        );
        
        if (result.modifiedCount === 0) {
          throw new Error('Atomic increment failed - bounds violated or document modified');
        }
        
        // Log successful operation
        await this.logAtomicOperation({
          operation: 'increment',
          collection: collection,
          filter: filter,
          field: field,
          incrementValue: incrementValue,
          previousValue: currentValue,
          newValue: newValue,
          timestamp: new Date()
        }, session);
        
        return {
          success: true,
          previousValue: currentValue,
          newValue: newValue,
          incrementValue: incrementValue
        };
      });
    } finally {
      await session.endSession();
    }
  }
  
  async atomicArrayOperation(collection, filter, arrayField, operation, value, options = {}) {
    // Thread-safe atomic array operations
    const session = this.db.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        const doc = await this.db.collection(collection).findOne(filter, { session });
        
        if (!doc) {
          throw new Error('Document not found for atomic array operation');
        }
        
        const currentArray = doc[arrayField] || [];
        let updateOperation = {};
        let operationResult = {};
        
        switch (operation) {
          case 'push':
            // Add element if not exists (optional uniqueness)
            if (options.unique && currentArray.includes(value)) {
              operationResult = {
                success: false,
                reason: 'duplicate_value',
                currentArray: currentArray
              };
            } else {
              updateOperation = { $push: { [arrayField]: value } };
              operationResult = {
                success: true,
                operation: 'push',
                value: value,
                newLength: currentArray.length + 1
              };
            }
            break;
            
          case 'pull':
            // Remove specific value
            if (!currentArray.includes(value)) {
              operationResult = {
                success: false,
                reason: 'value_not_found',
                currentArray: currentArray
              };
            } else {
              updateOperation = { $pull: { [arrayField]: value } };
              operationResult = {
                success: true,
                operation: 'pull',
                value: value,
                newLength: currentArray.length - 1
              };
            }
            break;
            
          case 'addToSet':
            // Add unique value to set
            updateOperation = { $addToSet: { [arrayField]: value } };
            operationResult = {
              success: true,
              operation: 'addToSet',
              value: value,
              wasAlreadyPresent: currentArray.includes(value)
            };
            break;
            
          case 'pop':
            // Remove last element
            if (currentArray.length === 0) {
              operationResult = {
                success: false,
                reason: 'array_empty',
                currentArray: currentArray
              };
            } else {
              updateOperation = { $pop: { [arrayField]: 1 } }; // Remove last
              operationResult = {
                success: true,
                operation: 'pop',
                removedValue: currentArray[currentArray.length - 1],
                newLength: currentArray.length - 1
              };
            }
            break;
            
          default:
            throw new Error(`Unsupported atomic array operation: ${operation}`);
        }
        
        if (operationResult.success && Object.keys(updateOperation).length > 0) {
          // Apply atomic update
          const result = await this.db.collection(collection).updateOne(
            filter,
            {
              ...updateOperation,
              $set: {
                lastModified: new Date(),
                lastArrayOperation: {
                  operation: operation,
                  value: value,
                  timestamp: new Date()
                }
              }
            },
            { session }
          );
          
          if (result.modifiedCount === 0) {
            throw new Error('Atomic array operation failed - document may have been modified');
          }
        }
        
        // Log operation
        await this.logAtomicOperation({
          operation: `array_${operation}`,
          collection: collection,
          filter: filter,
          arrayField: arrayField,
          value: value,
          result: operationResult,
          timestamp: new Date()
        }, session);
        
        return operationResult;
      });
    } finally {
      await session.endSession();
    }
  }
  
  async atomicUpsert(collection, filter, update, options = {}) {
    // Atomic upsert with race condition handling
    const session = this.db.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        // Try to find existing document
        const existingDoc = await this.db.collection(collection).findOne(filter, { session });
        
        if (existingDoc) {
          // Document exists - perform update with optimistic locking
          const currentVersion = existingDoc.version || 0;
          
          const result = await this.db.collection(collection).updateOne(
            {
              ...filter,
              version: currentVersion
            },
            {
              ...update,
              $inc: {
                ...(update.$inc || {}),
                version: 1
              },
              $set: {
                ...(update.$set || {}),
                lastModified: new Date(),
                operation: 'update'
              }
            },
            { session }
          );
          
          if (result.modifiedCount === 0) {
            throw new Error('Atomic upsert update failed - document modified concurrently');
          }
          
          return {
            operation: 'update',
            documentId: existingDoc._id,
            previousVersion: currentVersion,
            newVersion: currentVersion + 1,
            success: true
          };
          
        } else {
          // Document doesn't exist - try to insert
          const insertDoc = {
            ...filter,
            ...(update.$set || {}),
            version: 1,
            createdAt: new Date(),
            lastModified: new Date(),
            operation: 'insert'
          };
          
          // Apply increment operations to initial values
          if (update.$inc) {
            Object.keys(update.$inc).forEach(field => {
              if (field !== 'version') {
                insertDoc[field] = (insertDoc[field] || 0) + update.$inc[field];
              }
            });
          }
          
          try {
            const insertResult = await this.db.collection(collection).insertOne(
              insertDoc,
              { session }
            );
            
            return {
              operation: 'insert',
              documentId: insertResult.insertedId,
              version: 1,
              success: true
            };
          } catch (error) {
            if (error.code === 11000) {
              // Duplicate key - another process inserted concurrently
              // Retry as update
              throw new Error('Concurrent insert detected - retrying as update');
            }
            throw error;
          }
        }
      });
    } finally {
      await session.endSession();
    }
  }
  
  async atomicSwapFields(collection, filter, field1, field2, options = {}) {
    // Atomically swap values between two fields
    const session = this.db.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        const doc = await this.db.collection(collection).findOne(filter, { session });
        
        if (!doc) {
          throw new Error('Document not found for atomic field swap');
        }
        
        const value1 = doc[field1];
        const value2 = doc[field2];
        
        // Perform atomic swap
        const result = await this.db.collection(collection).updateOne(
          filter,
          {
            $set: {
              [field1]: value2,
              [field2]: value1,
              lastModified: new Date(),
              lastSwapOperation: {
                field1: field1,
                field2: field2,
                timestamp: new Date()
              }
            },
            $inc: {
              version: 1
            }
          },
          { session }
        );
        
        if (result.modifiedCount === 0) {
          throw new Error('Atomic field swap failed');
        }
        
        return {
          success: true,
          swappedValues: {
            [field1]: { from: value1, to: value2 },
            [field2]: { from: value2, to: value1 }
          }
        };
      });
    } finally {
      await session.endSession();
    }
  }
  
  async bulkAtomicOperations(operations, options = {}) {
    // Execute multiple atomic operations in a single transaction
    const session = this.db.client.startSession();
    const results = [];
    
    try {
      await session.withTransaction(async () => {
        for (const [index, op] of operations.entries()) {
          try {
            let result;
            
            switch (op.type) {
              case 'increment':
                result = await this.atomicIncrement(
                  op.collection, op.filter, op.field, op.value, { ...op.options, session }
                );
                break;
                
              case 'arrayOperation':
                result = await this.atomicArrayOperation(
                  op.collection, op.filter, op.arrayField, op.operation, op.value, 
                  { ...op.options, session }
                );
                break;
                
              case 'upsert':
                result = await this.atomicUpsert(
                  op.collection, op.filter, op.update, { ...op.options, session }
                );
                break;
                
              default:
                throw new Error(`Unsupported bulk operation type: ${op.type}`);
            }
            
            results.push({
              index: index,
              operation: op.type,
              success: true,
              result: result
            });
            
          } catch (error) {
            results.push({
              index: index,
              operation: op.type,
              success: false,
              error: error.message
            });
            
            if (!options.continueOnError) {
              throw error;
            }
          }
        }
      });
      
      return {
        success: true,
        totalOperations: operations.length,
        successfulOperations: results.filter(r => r.success).length,
        results: results
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        partialResults: results
      };
    } finally {
      await session.endSession();
    }
  }
  
  async logAtomicOperation(operationDetails, session) {
    // Log atomic operation for audit trail
    await this.operationLog.insertOne({
      ...operationDetails,
      operationId: ObjectId(),
      sessionId: session.id
    }, { session });
  }
}
```

### Transaction Isolation and Conflict Resolution

Implement sophisticated conflict resolution strategies:

```javascript
// Advanced conflict resolution and transaction isolation
class ConflictResolutionManager {
  constructor(db) {
    this.db = db;
    this.conflictLog = db.collection('conflict_resolution_log');
  }
  
  async resolveWithStrategy(collection, conflictData, strategy = 'merge', options = {}) {
    // Resolve conflicts using various strategies
    const session = this.db.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        const { 
          documentId, 
          baseVersion, 
          localChanges, 
          remoteChanges 
        } = conflictData;
        
        // Get current document state
        const currentDoc = await this.db.collection(collection).findOne(
          { _id: ObjectId(documentId) }, 
          { session }
        );
        
        if (!currentDoc) {
          throw new Error('Document not found for conflict resolution');
        }
        
        if (currentDoc.version <= baseVersion) {
          // No conflict - apply changes directly
          return await this.applyChanges(
            collection, documentId, localChanges, session
          );
        }
        
        // Conflict detected - apply resolution strategy
        let resolvedChanges;
        
        switch (strategy) {
          case 'merge':
            resolvedChanges = await this.mergeChanges(
              currentDoc, localChanges, remoteChanges, options
            );
            break;
            
          case 'last_write_wins':
            resolvedChanges = await this.lastWriteWins(
              localChanges, remoteChanges, options
            );
            break;
            
          case 'first_write_wins':
            resolvedChanges = await this.firstWriteWins(
              currentDoc, localChanges, baseVersion, options
            );
            break;
            
          case 'user_resolution':
            resolvedChanges = await this.userResolution(
              currentDoc, localChanges, remoteChanges, options
            );
            break;
            
          case 'field_level_merge':
            resolvedChanges = await this.fieldLevelMerge(
              currentDoc, localChanges, remoteChanges, options
            );
            break;
            
          default:
            throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
        }
        
        // Apply resolved changes
        const result = await this.applyResolvedChanges(
          collection, documentId, currentDoc.version, resolvedChanges, session
        );
        
        // Log conflict resolution
        await this.logConflictResolution({
          documentId: documentId,
          collection: collection,
          strategy: strategy,
          baseVersion: baseVersion,
          conflictVersion: currentDoc.version,
          localChanges: localChanges,
          remoteChanges: remoteChanges,
          resolvedChanges: resolvedChanges,
          resolvedAt: new Date(),
          resolvedBy: options.userId || 'system'
        }, session);
        
        return {
          success: true,
          strategy: strategy,
          conflictResolved: true,
          finalVersion: result.newVersion,
          resolvedChanges: resolvedChanges
        };
      });
    } finally {
      await session.endSession();
    }
  }
  
  async mergeChanges(currentDoc, localChanges, remoteChanges, options) {
    // Intelligent three-way merge
    const merged = { ...currentDoc };
    const conflicts = [];
    
    // Process local changes
    Object.keys(localChanges).forEach(field => {
      if (field === '_id' || field === 'version') return;
      
      const localValue = localChanges[field];
      const remoteValue = remoteChanges[field];
      const currentValue = currentDoc[field];
      
      if (remoteValue !== undefined && localValue !== remoteValue) {
        // Conflict detected - apply merge rules
        const mergeResult = this.mergeFieldValues(
          field, currentValue, localValue, remoteValue, options.mergeRules || {}
        );
        
        merged[field] = mergeResult.value;
        
        if (mergeResult.hadConflict) {
          conflicts.push({
            field: field,
            localValue: localValue,
            remoteValue: remoteValue,
            resolvedValue: mergeResult.value,
            mergeRule: mergeResult.rule
          });
        }
      } else {
        // No conflict - use local value
        merged[field] = localValue;
      }
    });
    
    // Process remote changes not in local changes
    Object.keys(remoteChanges).forEach(field => {
      if (field === '_id' || field === 'version') return;
      
      if (localChanges[field] === undefined) {
        merged[field] = remoteChanges[field];
      }
    });
    
    return {
      ...merged,
      conflicts: conflicts,
      mergeStrategy: 'three_way_merge',
      mergedAt: new Date()
    };
  }
  
  mergeFieldValues(fieldName, currentValue, localValue, remoteValue, mergeRules) {
    // Apply field-specific merge rules
    const fieldRule = mergeRules[fieldName];
    
    if (fieldRule) {
      switch (fieldRule.strategy) {
        case 'local_wins':
          return { value: localValue, hadConflict: true, rule: 'local_wins' };
          
        case 'remote_wins':  
          return { value: remoteValue, hadConflict: true, rule: 'remote_wins' };
          
        case 'max_value':
          return { 
            value: Math.max(localValue, remoteValue), 
            hadConflict: true, 
            rule: 'max_value' 
          };
          
        case 'min_value':
          return { 
            value: Math.min(localValue, remoteValue), 
            hadConflict: true, 
            rule: 'min_value' 
          };
          
        case 'concatenate':
          return { 
            value: `${localValue}${fieldRule.separator || ' '}${remoteValue}`, 
            hadConflict: true, 
            rule: 'concatenate' 
          };
          
        case 'array_merge':
          const localArray = Array.isArray(localValue) ? localValue : [];
          const remoteArray = Array.isArray(remoteValue) ? remoteValue : [];
          return { 
            value: [...new Set([...localArray, ...remoteArray])], 
            hadConflict: true, 
            rule: 'array_merge' 
          };
      }
    }
    
    // Default conflict resolution - prefer local changes
    return { value: localValue, hadConflict: true, rule: 'default_local' };
  }
  
  async lastWriteWins(localChanges, remoteChanges, options) {
    // Simple last write wins strategy
    const localTimestamp = localChanges.lastModified || new Date(0);
    const remoteTimestamp = remoteChanges.lastModified || new Date(0);
    
    return localTimestamp > remoteTimestamp ? localChanges : remoteChanges;
  }
  
  async firstWriteWins(currentDoc, localChanges, baseVersion, options) {
    // Keep current state, reject local changes
    return {
      ...currentDoc,
      rejectedChanges: localChanges,
      rejectionReason: 'first_write_wins',
      rejectedAt: new Date()
    };
  }
  
  async fieldLevelMerge(currentDoc, localChanges, remoteChanges, options) {
    // Merge at field level with timestamp tracking
    const merged = { ...currentDoc };
    const fieldMergeLog = [];
    
    // Get field timestamps if available
    const getFieldTimestamp = (changes, field) => {
      return changes.fieldTimestamps?.[field] || changes.lastModified || new Date(0);
    };
    
    // Merge each field independently
    const allFields = new Set([
      ...Object.keys(localChanges),
      ...Object.keys(remoteChanges)
    ]);
    
    allFields.forEach(field => {
      if (field === '_id' || field === 'version' || field === 'fieldTimestamps') return;
      
      const localValue = localChanges[field];
      const remoteValue = remoteChanges[field];
      const localTimestamp = getFieldTimestamp(localChanges, field);
      const remoteTimestamp = getFieldTimestamp(remoteChanges, field);
      
      if (localValue !== undefined && remoteValue !== undefined) {
        // Both have changes - use timestamp
        if (localTimestamp > remoteTimestamp) {
          merged[field] = localValue;
          fieldMergeLog.push({
            field: field,
            winner: 'local',
            localValue: localValue,
            remoteValue: remoteValue,
            reason: 'newer_timestamp'
          });
        } else {
          merged[field] = remoteValue;
          fieldMergeLog.push({
            field: field,
            winner: 'remote',
            localValue: localValue,
            remoteValue: remoteValue,
            reason: 'newer_timestamp'
          });
        }
      } else if (localValue !== undefined) {
        merged[field] = localValue;
      } else if (remoteValue !== undefined) {
        merged[field] = remoteValue;
      }
    });
    
    return {
      ...merged,
      fieldMergeLog: fieldMergeLog,
      mergeStrategy: 'field_level_timestamp',
      mergedAt: new Date()
    };
  }
  
  async applyResolvedChanges(collection, documentId, currentVersion, resolvedChanges, session) {
    // Apply conflict-resolved changes
    const result = await this.db.collection(collection).updateOne(
      { 
        _id: ObjectId(documentId),
        version: currentVersion
      },
      {
        $set: {
          ...resolvedChanges,
          lastModified: new Date(),
          conflictResolved: true
        },
        $inc: { version: 1 }
      },
      { session }
    );
    
    if (result.modifiedCount === 0) {
      throw new Error('Failed to apply resolved changes - document modified during resolution');
    }
    
    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: currentVersion + 1
    };
  }
  
  async detectConflicts(collection, documentId, baseVersion, proposedChanges) {
    // Detect potential conflicts before attempting resolution
    const currentDoc = await this.db.collection(collection).findOne({
      _id: ObjectId(documentId)
    });
    
    if (!currentDoc) {
      return { hasConflicts: false, reason: 'document_not_found' };
    }
    
    if (currentDoc.version <= baseVersion) {
      return { hasConflicts: false, reason: 'no_intervening_changes' };
    }
    
    // Analyze conflicts
    const conflicts = [];
    const changedFields = Object.keys(proposedChanges);
    
    changedFields.forEach(field => {
      if (field === '_id' || field === 'version') return;
      
      const proposedValue = proposedChanges[field];
      const currentValue = currentDoc[field];
      
      // Simple value comparison - in practice, this could be more sophisticated
      if (JSON.stringify(currentValue) !== JSON.stringify(proposedValue)) {
        conflicts.push({
          field: field,
          baseValue: 'unknown', // Would need to track base state
          currentValue: currentValue,
          proposedValue: proposedValue,
          conflictType: 'value_mismatch'
        });
      }
    });
    
    return {
      hasConflicts: conflicts.length > 0,
      conflictCount: conflicts.length,
      conflicts: conflicts,
      currentVersion: currentDoc.version,
      baseVersion: baseVersion
    };
  }
  
  async logConflictResolution(resolutionDetails, session) {
    // Log detailed conflict resolution information
    await this.conflictLog.insertOne({
      ...resolutionDetails,
      resolutionId: ObjectId()
    }, { session });
  }
}
```

## QueryLeaf Concurrency Control Integration

QueryLeaf provides SQL-familiar syntax for MongoDB concurrency operations:

```sql
-- QueryLeaf concurrency control with SQL-style syntax

-- Optimistic locking with version-based updates
BEGIN TRANSACTION ISOLATION LEVEL OPTIMISTIC;

-- Update with automatic version checking
UPDATE accounts 
SET balance = balance - @transfer_amount,
    last_transaction_date = CURRENT_TIMESTAMP
WHERE account_id = @from_account 
  AND version = @expected_version  -- Optimistic lock condition
  AND balance >= @transfer_amount; -- Safety check

-- Check if update succeeded (no race condition)
IF @@ROWCOUNT = 0
BEGIN
    ROLLBACK TRANSACTION;
    RAISERROR('Account modified by another transaction or insufficient funds', 16, 1);
    RETURN;
END

-- Atomic credit to destination account  
UPDATE accounts
SET balance = balance + @transfer_amount,
    version = version + 1,
    last_transaction_date = CURRENT_TIMESTAMP
WHERE account_id = @to_account;

-- Log transaction with conflict detection
INSERT INTO transactions (
    from_account,
    to_account, 
    amount,
    transaction_date,
    transaction_type,
    session_id
)
VALUES (
    @from_account,
    @to_account,
    @transfer_amount,
    CURRENT_TIMESTAMP,
    'transfer',
    CONNECTION_ID()
);

COMMIT TRANSACTION;

-- Atomic increment operations with bounds checking
UPDATE inventory
SET quantity = quantity + @increment_amount,
    version = version + 1,
    last_modified = CURRENT_TIMESTAMP
WHERE product_id = @product_id
  AND quantity + @increment_amount >= 0      -- Prevent negative inventory
  AND quantity + @increment_amount <= @max_stock; -- Prevent oversocking

-- Atomic array operations
-- Add item to array if not already present
UPDATE user_preferences
SET favorite_categories = ARRAY_APPEND_UNIQUE(favorite_categories, @new_category),
    version = version + 1,
    last_modified = CURRENT_TIMESTAMP
WHERE user_id = @user_id
  AND NOT ARRAY_CONTAINS(favorite_categories, @new_category);

-- Remove item from array
UPDATE user_preferences  
SET favorite_categories = ARRAY_REMOVE(favorite_categories, @remove_category),
    version = version + 1,
    last_modified = CURRENT_TIMESTAMP
WHERE user_id = @user_id
  AND ARRAY_CONTAINS(favorite_categories, @remove_category);

-- Compare-and-swap operations
UPDATE configuration
SET setting_value = @new_value,
    version = version + 1,
    last_modified = CURRENT_TIMESTAMP,
    modified_by = @user_id
WHERE setting_key = @setting_key
  AND setting_value = @expected_current_value  -- Compare condition
  AND version = @expected_version;            -- Additional version check

-- Bulk atomic operations with conflict handling
WITH batch_updates AS (
    SELECT 
        order_id,
        new_status,
        expected_version,
        ROW_NUMBER() OVER (ORDER BY order_id) as batch_order
    FROM (VALUES 
        ('order_1', 'shipped', 5),
        ('order_2', 'shipped', 3), 
        ('order_3', 'shipped', 7)
    ) AS v(order_id, new_status, expected_version)
),
update_results AS (
    UPDATE orders o
    SET status = b.new_status,
        version = version + 1,
        status_changed_at = CURRENT_TIMESTAMP,
        batch_id = @batch_id
    FROM batch_updates b
    WHERE o.order_id = b.order_id
      AND o.version = b.expected_version  -- Optimistic lock per order
    RETURNING o.order_id, o.version as new_version, 'success' as result
)
SELECT 
    b.order_id,
    COALESCE(r.result, 'failed') as update_result,
    r.new_version,
    CASE 
        WHEN r.result IS NULL THEN 'Version conflict or order not found'
        ELSE 'Successfully updated'
    END as message
FROM batch_updates b
LEFT JOIN update_results r ON b.order_id = r.order_id
ORDER BY b.batch_order;

-- Conflict detection and resolution
WITH conflict_detection AS (
    SELECT 
        document_id,
        current_version,
        proposed_changes,
        base_version,
        CASE 
            WHEN current_version > base_version THEN 'conflict_detected'
            ELSE 'no_conflict'
        END as conflict_status,
        
        -- Analyze field-level conflicts
        JSON_EXTRACT_PATH(proposed_changes, 'field1') as proposed_field1,
        JSON_EXTRACT_PATH(current_data, 'field1') as current_field1,
        
        CASE 
            WHEN JSON_EXTRACT_PATH(proposed_changes, 'field1') != 
                 JSON_EXTRACT_PATH(current_data, 'field1') THEN 'field_conflict'
            ELSE 'no_field_conflict'
        END as field1_status
    FROM documents d
    CROSS JOIN proposed_updates p ON d.id = p.document_id
),
conflict_resolution AS (
    SELECT 
        document_id,
        conflict_status,
        
        -- Apply merge strategy based on conflict type
        CASE conflict_status
            WHEN 'no_conflict' THEN proposed_changes
            WHEN 'conflict_detected' THEN 
                CASE @resolution_strategy
                    WHEN 'merge' THEN MERGE_JSON(current_data, proposed_changes)
                    WHEN 'last_write_wins' THEN proposed_changes
                    WHEN 'first_write_wins' THEN current_data
                    ELSE proposed_changes
                END
        END as resolved_changes
    FROM conflict_detection
)
UPDATE documents d
SET data = r.resolved_changes,
    version = version + 1,
    last_modified = CURRENT_TIMESTAMP,
    conflict_resolved = CASE r.conflict_status 
        WHEN 'conflict_detected' THEN TRUE 
        ELSE FALSE 
    END,
    resolution_strategy = @resolution_strategy
FROM conflict_resolution r
WHERE d.id = r.document_id;

-- High-concurrency counter with atomic operations
-- Safe increment even under heavy concurrent load
UPDATE page_views
SET view_count = view_count + 1,
    last_view_timestamp = CURRENT_TIMESTAMP,
    version = version + 1
WHERE page_id = @page_id;

-- If page doesn't exist, create it atomically
INSERT INTO page_views (page_id, view_count, first_view_timestamp, last_view_timestamp, version)
SELECT @page_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
WHERE NOT EXISTS (SELECT 1 FROM page_views WHERE page_id = @page_id);

-- Distributed lock implementation for critical sections
WITH lock_acquisition AS (
    INSERT INTO distributed_locks (
        lock_key,
        acquired_by,
        acquired_at,
        expires_at,
        lock_version
    )
    SELECT 
        @lock_key,
        @process_id,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + INTERVAL @timeout_seconds SECOND,
        1
    WHERE NOT EXISTS (
        SELECT 1 FROM distributed_locks 
        WHERE lock_key = @lock_key 
          AND expires_at > CURRENT_TIMESTAMP
    )
    RETURNING lock_key, acquired_by, acquired_at
)
SELECT 
    CASE 
        WHEN l.lock_key IS NOT NULL THEN 'acquired'
        ELSE 'failed'
    END as lock_status,
    l.acquired_by,
    l.acquired_at
FROM lock_acquisition l;

-- Release distributed lock
DELETE FROM distributed_locks
WHERE lock_key = @lock_key
  AND acquired_by = @process_id
  AND lock_version = @expected_version;

-- QueryLeaf automatically handles:
-- 1. Version-based optimistic locking
-- 2. Atomic increment and decrement operations  
-- 3. Array manipulation with uniqueness constraints
-- 4. Compare-and-swap semantics
-- 5. Bulk operations with per-document conflict detection
-- 6. Conflict resolution strategies (merge, last-wins, first-wins)
-- 7. Distributed locking mechanisms
-- 8. Transaction isolation levels
-- 9. Deadlock prevention and detection
-- 10. Performance optimization for high-concurrency scenarios
```

## Best Practices for Concurrency Management

### Design Guidelines

Essential practices for effective concurrency control:

1. **Version-Based Optimistic Locking**: Implement version fields in documents that change frequently
2. **Atomic Operations**: Use MongoDB's atomic update operations instead of read-modify-write patterns  
3. **Transaction Boundaries**: Keep transactions short and focused to minimize lock contention
4. **Conflict Resolution**: Design clear conflict resolution strategies appropriate for your use case
5. **Retry Logic**: Implement exponential backoff retry for optimistic locking failures
6. **Performance Monitoring**: Monitor contention points and optimize high-conflict operations

### Concurrency Patterns

Choose appropriate concurrency patterns:

1. **Document-Level Locking**: Use optimistic locking for individual document updates
2. **Field-Level Granularity**: Implement field-specific version control for large documents
3. **Event Sourcing**: Consider event-driven architectures for high-conflict scenarios  
4. **CQRS**: Separate read and write operations to reduce contention
5. **Distributed Locking**: Use distributed locks for cross-document consistency requirements
6. **Queue-Based Processing**: Use message queues to serialize high-conflict operations

## Conclusion

MongoDB's sophisticated concurrency control mechanisms provide powerful tools for managing race conditions and maintaining data integrity in high-throughput applications. Combined with SQL-familiar concurrency patterns, MongoDB enables robust multi-user applications that scale effectively under load.

Key concurrency management benefits include:

- **High Performance**: Optimistic locking avoids blocking operations under normal conditions
- **Scalability**: Non-blocking concurrency control scales with user load
- **Data Integrity**: Automatic conflict detection prevents lost updates and inconsistent states
- **Flexible Resolution**: Multiple conflict resolution strategies accommodate different business requirements
- **ACID Compliance**: Multi-document transactions provide full ACID guarantees when needed

Whether you're building financial systems requiring strict consistency, collaborative platforms with concurrent editing, or high-throughput applications with frequent updates, MongoDB's concurrency control with QueryLeaf's familiar SQL interface provides the foundation for robust, scalable applications. This combination enables you to implement sophisticated concurrency patterns while preserving familiar database interaction models.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB concurrency control including optimistic locking, atomic operations, and conflict resolution while providing SQL-familiar transaction syntax. Complex concurrency patterns, version management, and conflict resolution strategies are seamlessly handled through familiar SQL constructs, making advanced concurrency control both powerful and accessible.

The integration of sophisticated concurrency control with SQL-style operations makes MongoDB an ideal platform for applications requiring both high-performance concurrent operations and familiar database development patterns, ensuring your concurrency solutions remain both effective and maintainable as they scale and evolve.