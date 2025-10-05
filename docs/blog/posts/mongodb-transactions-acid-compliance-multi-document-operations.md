---
title: "MongoDB Transactions and ACID Compliance: Advanced Multi-Document Operations for Distributed Application Consistency"
description: "Master MongoDB multi-document transactions and ACID compliance for complex distributed applications. Learn advanced transaction patterns, consistency guarantees, and error handling with SQL-familiar transaction management techniques."
date: 2025-10-04
tags: [mongodb, transactions, acid, multi-document, consistency, sql, distributed-systems]
---

# MongoDB Transactions and ACID Compliance: Advanced Multi-Document Operations for Distributed Application Consistency

Modern distributed applications require sophisticated transaction management capabilities that can guarantee data consistency across multiple documents, collections, and database operations while maintaining high performance and availability. Traditional approaches to maintaining consistency in NoSQL systems often involve complex application-level coordination, eventual consistency patterns, or sacrificing atomicity guarantees that become increasingly problematic as business logic complexity grows.

MongoDB's multi-document ACID transactions provide comprehensive support for complex business operations that span multiple documents and collections while maintaining strict consistency guarantees. Unlike traditional NoSQL systems that sacrifice consistency for scalability, MongoDB transactions offer full ACID compliance with distributed transaction support, enabling sophisticated financial applications, inventory management systems, and complex workflow automation that requires atomic operations across multiple data entities.

## The Traditional NoSQL Transaction Challenge

Conventional NoSQL transaction approaches suffer from significant limitations for complex business operations:

```javascript
// Traditional NoSQL approaches - complex application-level coordination and consistency challenges

// Approach 1: Application-level two-phase commit (error-prone and complex)
class TraditionalOrderProcessor {
  constructor(databases) {
    this.userDB = databases.users;
    this.inventoryDB = databases.inventory;
    this.orderDB = databases.orders;
    this.paymentDB = databases.payments;
    this.auditDB = databases.audit;
    
    // Complex state tracking for manual coordination
    this.pendingTransactions = new Map();
    this.compensationLog = [];
    this.retryQueue = [];
  }

  async processComplexOrder(orderData) {
    const transactionId = require('crypto').randomUUID();
    const operationLog = [];
    let rollbackOperations = [];

    try {
      // Phase 1: Prepare all operations
      console.log('Phase 1: Preparing distributed operations...');
      
      // Step 1: Validate user account and credit limit
      const user = await this.userDB.findOne({ _id: orderData.userId });
      if (!user) {
        throw new Error('User not found');
      }
      
      if (user.creditLimit < orderData.totalAmount) {
        throw new Error('Insufficient credit limit');
      }
      
      // Step 2: Reserve inventory across multiple items
      const inventoryReservations = [];
      const inventoryUpdates = [];
      
      for (const item of orderData.items) {
        const product = await this.inventoryDB.findOne({ 
          _id: item.productId,
          availableQuantity: { $gte: item.quantity }
        });
        
        if (!product) {
          // Manual rollback required
          await this.rollbackInventoryReservations(inventoryReservations);
          throw new Error(`Insufficient inventory for product ${item.productId}`);
        }
        
        // Manual inventory reservation (not atomic)
        const reservationResult = await this.inventoryDB.updateOne(
          { 
            _id: item.productId,
            availableQuantity: { $gte: item.quantity }
          },
          {
            $inc: { 
              availableQuantity: -item.quantity,
              reservedQuantity: item.quantity
            },
            $push: {
              reservations: {
                orderId: transactionId,
                quantity: item.quantity,
                timestamp: new Date(),
                status: 'pending'
              }
            }
          }
        );
        
        if (reservationResult.modifiedCount === 0) {
          // Race condition occurred, need to rollback
          await this.rollbackInventoryReservations(inventoryReservations);
          throw new Error(`Race condition: inventory changed for product ${item.productId}`);
        }
        
        inventoryReservations.push({
          productId: item.productId,
          quantity: item.quantity,
          reservationId: `${transactionId}_${item.productId}`
        });
        
        rollbackOperations.push({
          type: 'inventory_rollback',
          operation: () => this.inventoryDB.updateOne(
            { _id: item.productId },
            {
              $inc: {
                availableQuantity: item.quantity,
                reservedQuantity: -item.quantity
              },
              $pull: {
                reservations: { orderId: transactionId }
              }
            }
          )
        });
      }

      // Step 3: Process payment authorization
      const paymentAuth = await this.processPaymentAuthorization(orderData);
      if (!paymentAuth.success) {
        await this.rollbackInventoryReservations(inventoryReservations);
        throw new Error(`Payment authorization failed: ${paymentAuth.error}`);
      }
      
      rollbackOperations.push({
        type: 'payment_rollback',
        operation: () => this.voidPaymentAuthorization(paymentAuth.authId)
      });

      // Step 4: Update user account balance and credit
      const userUpdateResult = await this.userDB.updateOne(
        { 
          _id: orderData.userId,
          creditUsed: { $lte: user.creditLimit - orderData.totalAmount }
        },
        {
          $inc: {
            creditUsed: orderData.totalAmount,
            totalOrderValue: orderData.totalAmount,
            orderCount: 1
          },
          $set: {
            lastOrderDate: new Date()
          }
        }
      );
      
      if (userUpdateResult.modifiedCount === 0) {
        // User account changed during processing
        await this.executeRollbackOperations(rollbackOperations);
        throw new Error('User account state changed during processing');
      }
      
      rollbackOperations.push({
        type: 'user_rollback', 
        operation: () => this.userDB.updateOne(
          { _id: orderData.userId },
          {
            $inc: {
              creditUsed: -orderData.totalAmount,
              totalOrderValue: -orderData.totalAmount,
              orderCount: -1
            }
          }
        )
      });

      // Phase 2: Commit all operations
      console.log('Phase 2: Committing distributed transaction...');
      
      // Create the order document
      const orderDocument = {
        _id: transactionId,
        userId: orderData.userId,
        items: orderData.items,
        totalAmount: orderData.totalAmount,
        paymentAuthId: paymentAuth.authId,
        inventoryReservations: inventoryReservations,
        status: 'processing',
        createdAt: new Date(),
        transactionLog: operationLog
      };
      
      const orderResult = await this.orderDB.insertOne(orderDocument);
      if (!orderResult.insertedId) {
        await this.executeRollbackOperations(rollbackOperations);
        throw new Error('Failed to create order document');
      }
      
      // Confirm inventory reservations
      for (const reservation of inventoryReservations) {
        await this.inventoryDB.updateOne(
          { 
            _id: reservation.productId,
            'reservations.orderId': transactionId
          },
          {
            $set: {
              'reservations.$.status': 'confirmed',
              'reservations.$.confirmedAt': new Date()
            }
          }
        );
      }
      
      // Capture payment
      const paymentCapture = await this.capturePayment(paymentAuth.authId);
      if (!paymentCapture.success) {
        await this.executeRollbackOperations(rollbackOperations);
        throw new Error(`Payment capture failed: ${paymentCapture.error}`);
      }
      
      // Record payment transaction
      await this.paymentDB.insertOne({
        _id: `payment_${transactionId}`,
        orderId: transactionId,
        userId: orderData.userId,
        amount: orderData.totalAmount,
        authId: paymentAuth.authId,
        captureId: paymentCapture.captureId,
        status: 'captured',
        capturedAt: new Date()
      });
      
      // Update order status
      await this.orderDB.updateOne(
        { _id: transactionId },
        {
          $set: {
            status: 'confirmed',
            confirmedAt: new Date(),
            paymentCaptureId: paymentCapture.captureId
          }
        }
      );
      
      // Audit log entry
      await this.auditDB.insertOne({
        _id: `audit_${transactionId}`,
        transactionId: transactionId,
        operationType: 'order_processing',
        userId: orderData.userId,
        amount: orderData.totalAmount,
        operations: operationLog,
        status: 'success',
        completedAt: new Date()
      });
      
      console.log(`Transaction ${transactionId} completed successfully`);
      return {
        success: true,
        transactionId: transactionId,
        orderId: transactionId,
        operationsCompleted: operationLog.length
      };

    } catch (error) {
      console.error(`Transaction ${transactionId} failed:`, error.message);
      
      // Execute rollback operations in reverse order
      await this.executeRollbackOperations(rollbackOperations.reverse());
      
      // Log failure for investigation
      await this.auditDB.insertOne({
        _id: `audit_failed_${transactionId}`,
        transactionId: transactionId,
        operationType: 'order_processing',
        userId: orderData.userId,
        amount: orderData.totalAmount,
        error: error.message,
        rollbackOperations: rollbackOperations.length,
        status: 'failed',
        failedAt: new Date()
      });
      
      return {
        success: false,
        transactionId: transactionId,
        error: error.message,
        rollbacksExecuted: rollbackOperations.length
      };
    }
  }

  async rollbackInventoryReservations(reservations) {
    const rollbackPromises = reservations.map(async (reservation) => {
      try {
        await this.inventoryDB.updateOne(
          { _id: reservation.productId },
          {
            $inc: {
              availableQuantity: reservation.quantity,
              reservedQuantity: -reservation.quantity
            },
            $pull: {
              reservations: { orderId: reservation.reservationId }
            }
          }
        );
      } catch (rollbackError) {
        console.error(`Rollback failed for product ${reservation.productId}:`, rollbackError);
        // In production, this would need sophisticated error handling
        // and potentially manual intervention
      }
    });
    
    await Promise.allSettled(rollbackPromises);
  }

  async executeRollbackOperations(rollbackOperations) {
    for (const rollback of rollbackOperations) {
      try {
        await rollback.operation();
        console.log(`Rollback completed: ${rollback.type}`);
      } catch (rollbackError) {
        console.error(`Rollback failed: ${rollback.type}`, rollbackError);
        // This is where things get really complicated - failed rollbacks
        // require manual intervention and complex recovery procedures
      }
    }
  }

  async processPaymentAuthorization(orderData) {
    // Simulate payment authorization
    return new Promise((resolve) => {
      setTimeout(() => {
        if (Math.random() > 0.1) { // 90% success rate
          resolve({
            success: true,
            authId: `auth_${require('crypto').randomUUID()}`,
            amount: orderData.totalAmount,
            authorizedAt: new Date()
          });
        } else {
          resolve({
            success: false,
            error: 'Payment authorization declined'
          });
        }
      }, 100);
    });
  }

  async capturePayment(authId) {
    // Simulate payment capture
    return new Promise((resolve) => {
      setTimeout(() => {
        if (Math.random() > 0.05) { // 95% success rate
          resolve({
            success: true,
            captureId: `capture_${require('crypto').randomUUID()}`,
            capturedAt: new Date()
          });
        } else {
          resolve({
            success: false,
            error: 'Payment capture failed'
          });
        }
      }, 150);
    });
  }
}

// Problems with traditional NoSQL transaction approaches:
// 1. Complex application-level coordination requiring extensive error handling
// 2. Race conditions and consistency issues between operations
// 3. Manual rollback implementation prone to failures and partial states
// 4. No atomicity guarantees - partial failures leave system in inconsistent state
// 5. Difficult debugging and troubleshooting of transaction failures
// 6. Poor performance due to multiple round-trips and coordination overhead
// 7. Scalability limitations as transaction complexity increases
// 8. No isolation guarantees - concurrent transactions can interfere
// 9. Limited durability guarantees without complex persistence coordination
// 10. Operational complexity for monitoring and maintaining distributed state

// Approach 2: Eventual consistency with compensation patterns (Saga pattern)
class SagaOrderProcessor {
  constructor(eventStore, commandHandlers) {
    this.eventStore = eventStore;
    this.commandHandlers = commandHandlers;
    this.sagaState = new Map();
  }

  async processOrderSaga(orderData) {
    const sagaId = require('crypto').randomUUID();
    const saga = {
      id: sagaId,
      status: 'started',
      steps: [
        { name: 'validate_user', status: 'pending', compensate: 'none' },
        { name: 'reserve_inventory', status: 'pending', compensate: 'release_inventory' },
        { name: 'process_payment', status: 'pending', compensate: 'refund_payment' },
        { name: 'create_order', status: 'pending', compensate: 'cancel_order' },
        { name: 'update_user_account', status: 'pending', compensate: 'revert_user_account' }
      ],
      currentStep: 0,
      compensationNeeded: false,
      orderData: orderData,
      createdAt: new Date()
    };

    this.sagaState.set(sagaId, saga);

    try {
      await this.executeSagaSteps(saga);
      return { success: true, sagaId: sagaId, status: 'completed' };
    } catch (error) {
      await this.executeCompensation(saga, error);
      return { success: false, sagaId: sagaId, error: error.message, status: 'compensated' };
    }
  }

  async executeSagaSteps(saga) {
    for (let i = saga.currentStep; i < saga.steps.length; i++) {
      const step = saga.steps[i];
      console.log(`Executing saga step: ${step.name}`);

      try {
        const stepResult = await this.executeStep(step.name, saga.orderData);
        step.status = 'completed';
        step.result = stepResult;
        saga.currentStep = i + 1;
        
        // Save saga state after each step
        await this.saveSagaState(saga);
        
      } catch (stepError) {
        console.error(`Saga step ${step.name} failed:`, stepError);
        step.status = 'failed';
        step.error = stepError.message;
        saga.compensationNeeded = true;
        throw stepError;
      }
    }
    
    saga.status = 'completed';
    await this.saveSagaState(saga);
  }

  async executeCompensation(saga, originalError) {
    console.log(`Executing compensation for saga ${saga.id}`);
    saga.status = 'compensating';
    
    // Execute compensation in reverse order of completed steps
    for (let i = saga.currentStep - 1; i >= 0; i--) {
      const step = saga.steps[i];
      
      if (step.status === 'completed' && step.compensate !== 'none') {
        try {
          console.log(`Compensating step: ${step.name}`);
          await this.executeCompensation(step.compensate, step.result, saga.orderData);
          step.compensationStatus = 'completed';
        } catch (compensationError) {
          console.error(`Compensation failed for ${step.name}:`, compensationError);
          step.compensationStatus = 'failed';
          step.compensationError = compensationError.message;
          
          // In a real system, this would require manual intervention
          // or sophisticated retry and escalation mechanisms
        }
      }
    }
    
    saga.status = 'compensated';
    saga.originalError = originalError.message;
    await this.saveSagaState(saga);
  }

  // Saga pattern problems:
  // 1. Complex state management and coordination across services
  // 2. No isolation - other transactions can see intermediate states
  // 3. Compensation logic complexity increases exponentially with steps
  // 4. Potential for cascading failures during compensation
  // 5. Debugging and troubleshooting distributed saga state is difficult
  // 6. Performance overhead from state persistence and coordination
  // 7. Limited consistency guarantees during saga execution
  // 8. Operational complexity for monitoring and error recovery
  // 9. No built-in support for complex business rules and constraints
  // 10. Scalability challenges as saga complexity and concurrency increase
}
```

MongoDB provides comprehensive ACID transactions with multi-document support:

```javascript
// MongoDB Multi-Document ACID Transactions - comprehensive atomic operations with full consistency guarantees
const { MongoClient, ClientSession } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_platform');

// Advanced MongoDB Transaction Management System
class MongoTransactionManager {
  constructor(db) {
    this.db = db;
    this.collections = {
      users: db.collection('users'),
      products: db.collection('products'),
      inventory: db.collection('inventory'), 
      orders: db.collection('orders'),
      payments: db.collection('payments'),
      audit: db.collection('audit'),
      promotions: db.collection('promotions'),
      loyalty: db.collection('loyalty_points')
    };
    
    // Transaction configuration
    this.transactionConfig = {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority', j: true },
      readPreference: 'primary',
      maxTimeMS: 60000, // 1 minute timeout
      maxCommitTimeMS: 30000 // 30 second commit timeout
    };
    
    this.retryConfig = {
      maxRetries: 3,
      retryDelayMs: 100,
      backoffFactor: 2
    };
  }

  async processComplexOrderTransaction(orderData, options = {}) {
    console.log(`Starting complex order transaction for user: ${orderData.userId}`);
    
    const session = client.startSession();
    const transactionResults = {
      transactionId: require('crypto').randomUUID(),
      success: false,
      operations: [],
      metrics: {
        startTime: new Date(),
        endTime: null,
        durationMs: 0,
        documentsModified: 0,
        collectionsAffected: 0
      },
      rollbackExecuted: false,
      error: null
    };

    try {
      // Start transaction with ACID guarantees
      await session.withTransaction(async () => {
        console.log('Beginning atomic transaction...');
        
        // Operation 1: Validate user account and apply business rules
        const userValidation = await this.validateAndUpdateUserAccount(
          orderData.userId, 
          orderData.totalAmount, 
          session,
          transactionResults
        );
        
        if (!userValidation.valid) {
          throw new Error(`User validation failed: ${userValidation.reason}`);
        }

        // Operation 2: Apply promotional codes and calculate discounts
        const promotionResult = await this.applyPromotionsAndDiscounts(
          orderData,
          userValidation.user,
          session,
          transactionResults
        );

        // Update order total with promotions
        orderData.originalTotal = orderData.totalAmount;
        orderData.totalAmount = promotionResult.finalAmount;
        orderData.discountsApplied = promotionResult.discountsApplied;

        // Operation 3: Reserve inventory with complex allocation logic
        const inventoryReservation = await this.reserveInventoryWithAllocation(
          orderData.items,
          transactionResults.transactionId,
          session,
          transactionResults
        );

        if (!inventoryReservation.success) {
          throw new Error(`Inventory reservation failed: ${inventoryReservation.reason}`);
        }

        // Operation 4: Process payment with fraud detection
        const paymentResult = await this.processPaymentWithFraudDetection(
          orderData,
          userValidation.user,
          session,
          transactionResults
        );

        if (!paymentResult.success) {
          throw new Error(`Payment processing failed: ${paymentResult.reason}`);
        }

        // Operation 5: Create comprehensive order document
        const orderCreation = await this.createComprehensiveOrder(
          orderData,
          userValidation.user,
          inventoryReservation,
          paymentResult,
          promotionResult,
          session,
          transactionResults
        );

        // Operation 6: Update user loyalty points and tier status
        await this.updateUserLoyaltyAndTier(
          orderData.userId,
          orderData.totalAmount,
          orderData.items,
          session,
          transactionResults
        );

        // Operation 7: Create audit trail with comprehensive tracking
        await this.createComprehensiveAuditTrail(
          transactionResults.transactionId,
          orderData,
          userValidation.user,
          paymentResult,
          inventoryReservation,
          promotionResult,
          session,
          transactionResults
        );

        // All operations completed successfully within transaction
        console.log(`Transaction ${transactionResults.transactionId} completed with ${transactionResults.operations.length} operations`);
        
      }, this.transactionConfig);

      // Transaction committed successfully
      transactionResults.success = true;
      transactionResults.metrics.endTime = new Date();
      transactionResults.metrics.durationMs = transactionResults.metrics.endTime - transactionResults.metrics.startTime;
      
      console.log(`Order transaction completed successfully in ${transactionResults.metrics.durationMs}ms`);
      console.log(`${transactionResults.metrics.documentsModified} documents modified across ${transactionResults.metrics.collectionsAffected} collections`);

    } catch (error) {
      console.error(`Transaction ${transactionResults.transactionId} failed:`, error.message);
      transactionResults.success = false;
      transactionResults.error = {
        message: error.message,
        code: error.code,
        codeName: error.codeName,
        stack: error.stack
      };
      transactionResults.rollbackExecuted = true;
      transactionResults.metrics.endTime = new Date();
      transactionResults.metrics.durationMs = transactionResults.metrics.endTime - transactionResults.metrics.startTime;

      // MongoDB automatically handles rollback for failed transactions
      console.log(`Automatic rollback executed for transaction ${transactionResults.transactionId}`);
      
    } finally {
      await session.endSession();
    }

    return transactionResults;
  }

  async validateAndUpdateUserAccount(userId, orderAmount, session, transactionResults) {
    console.log(`Validating user account: ${userId}`);
    
    const user = await this.collections.users.findOne(
      { _id: userId },
      { session }
    );

    if (!user) {
      return { valid: false, reason: 'User not found' };
    }

    if (user.status !== 'active') {
      return { valid: false, reason: 'User account is not active' };
    }

    // Complex business rules validation
    const availableCredit = user.creditLimit - user.creditUsed;
    const dailySpendingLimit = user.dailySpendingLimit || user.creditLimit * 0.3;
    const todaySpending = user.dailySpending?.find(d => 
      d.date.toDateString() === new Date().toDateString()
    )?.amount || 0;

    if (orderAmount > availableCredit) {
      return { 
        valid: false, 
        reason: `Insufficient credit: available ${availableCredit}, required ${orderAmount}` 
      };
    }

    if (todaySpending + orderAmount > dailySpendingLimit) {
      return { 
        valid: false, 
        reason: `Daily spending limit exceeded: limit ${dailySpendingLimit}, current ${todaySpending}, requested ${orderAmount}` 
      };
    }

    // Update user account within transaction
    const updateResult = await this.collections.users.updateOne(
      { _id: userId },
      {
        $inc: {
          creditUsed: orderAmount,
          totalOrderValue: orderAmount,
          orderCount: 1
        },
        $set: {
          lastOrderDate: new Date(),
          lastActivityAt: new Date()
        },
        $push: {
          dailySpending: {
            $each: [{
              date: new Date(),
              amount: todaySpending + orderAmount
            }],
            $slice: -30 // Keep last 30 days
          }
        }
      },
      { session }
    );

    this.updateTransactionMetrics(transactionResults, 'users', 'validateAndUpdateUserAccount', updateResult);

    return { 
      valid: true, 
      user: user,
      creditUsed: orderAmount,
      remainingCredit: availableCredit - orderAmount
    };
  }

  async applyPromotionsAndDiscounts(orderData, user, session, transactionResults) {
    console.log('Applying promotions and discounts...');
    
    let finalAmount = orderData.totalAmount;
    let discountsApplied = [];
    
    // Find applicable promotions
    const applicablePromotions = await this.collections.promotions.find({
      status: 'active',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { applicableToUsers: user._id },
        { applicableToUserTiers: user.tier },
        { applicableToAll: true }
      ]
    }, { session }).toArray();

    for (const promotion of applicablePromotions) {
      let discountAmount = 0;
      let applicable = false;

      // Validate promotion conditions
      if (promotion.minimumOrderAmount && orderData.totalAmount < promotion.minimumOrderAmount) {
        continue;
      }

      if (promotion.applicableProducts && promotion.applicableProducts.length > 0) {
        const hasApplicableProducts = orderData.items.some(item => 
          promotion.applicableProducts.includes(item.productId)
        );
        if (!hasApplicableProducts) continue;
      }

      // Calculate discount based on promotion type
      switch (promotion.type) {
        case 'percentage':
          discountAmount = finalAmount * (promotion.discountPercentage / 100);
          if (promotion.maxDiscount) {
            discountAmount = Math.min(discountAmount, promotion.maxDiscount);
          }
          applicable = true;
          break;
          
        case 'fixed_amount':
          discountAmount = Math.min(promotion.discountAmount, finalAmount);
          applicable = true;
          break;
          
        case 'buy_x_get_y':
          const qualifyingItems = orderData.items.filter(item => 
            promotion.buyProducts.includes(item.productId)
          );
          const totalQualifyingQuantity = qualifyingItems.reduce((sum, item) => sum + item.quantity, 0);
          
          if (totalQualifyingQuantity >= promotion.buyQuantity) {
            const freeQuantity = Math.floor(totalQualifyingQuantity / promotion.buyQuantity) * promotion.getQuantity;
            const averagePrice = qualifyingItems.reduce((sum, item) => sum + item.price, 0) / qualifyingItems.length;
            discountAmount = freeQuantity * averagePrice;
            applicable = true;
          }
          break;
      }

      if (applicable && discountAmount > 0) {
        finalAmount -= discountAmount;
        discountsApplied.push({
          promotionId: promotion._id,
          promotionName: promotion.name,
          discountAmount: discountAmount,
          appliedAt: new Date()
        });

        // Update promotion usage
        await this.collections.promotions.updateOne(
          { _id: promotion._id },
          {
            $inc: { usageCount: 1 },
            $push: {
              recentUsage: {
                userId: user._id,
                orderId: transactionResults.transactionId,
                discountAmount: discountAmount,
                usedAt: new Date()
              }
            }
          },
          { session }
        );

        this.updateTransactionMetrics(transactionResults, 'promotions', 'applyPromotionsAndDiscounts');
      }
    }

    console.log(`Applied ${discountsApplied.length} promotions, total discount: ${orderData.totalAmount - finalAmount}`);

    return {
      finalAmount: Math.max(finalAmount, 0), // Ensure non-negative
      discountsApplied: discountsApplied,
      totalDiscount: orderData.totalAmount - finalAmount
    };
  }

  async reserveInventoryWithAllocation(orderItems, transactionId, session, transactionResults) {
    console.log(`Reserving inventory for ${orderItems.length} items...`);
    
    const reservationResults = [];
    const allocationStrategy = 'fifo'; // First-In-First-Out allocation

    for (const item of orderItems) {
      // Find available inventory with complex allocation logic
      const inventoryRecords = await this.collections.inventory.find({
        productId: item.productId,
        availableQuantity: { $gt: 0 },
        status: 'active'
      }, { session })
      .sort({ createdAt: 1 }) // FIFO allocation
      .toArray();

      let remainingQuantity = item.quantity;
      const allocatedFrom = [];

      for (const inventoryRecord of inventoryRecords) {
        if (remainingQuantity <= 0) break;

        const allocateQuantity = Math.min(remainingQuantity, inventoryRecord.availableQuantity);
        
        // Reserve inventory from this record
        const reservationResult = await this.collections.inventory.updateOne(
          { 
            _id: inventoryRecord._id,
            availableQuantity: { $gte: allocateQuantity }
          },
          {
            $inc: { 
              availableQuantity: -allocateQuantity,
              reservedQuantity: allocateQuantity
            },
            $push: {
              reservations: {
                reservationId: `${transactionId}_${item.productId}_${inventoryRecord._id}`,
                orderId: transactionId,
                quantity: allocateQuantity,
                reservedAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
                status: 'active'
              }
            }
          },
          { session }
        );

        if (reservationResult.modifiedCount === 1) {
          allocatedFrom.push({
            inventoryId: inventoryRecord._id,
            warehouseLocation: inventoryRecord.location,
            quantity: allocateQuantity,
            unitCost: inventoryRecord.unitCost
          });
          remainingQuantity -= allocateQuantity;
          
          this.updateTransactionMetrics(transactionResults, 'inventory', 'reserveInventoryWithAllocation', reservationResult);
        }
      }

      if (remainingQuantity > 0) {
        return {
          success: false,
          reason: `Insufficient inventory for product ${item.productId}: requested ${item.quantity}, available ${item.quantity - remainingQuantity}`
        };
      }

      reservationResults.push({
        productId: item.productId,
        requestedQuantity: item.quantity,
        allocatedFrom: allocatedFrom,
        totalCost: allocatedFrom.reduce((sum, alloc) => sum + (alloc.quantity * alloc.unitCost), 0)
      });
    }

    console.log(`Successfully reserved inventory for all ${orderItems.length} items`);

    return {
      success: true,
      reservationId: transactionId,
      reservations: reservationResults,
      totalReservedItems: reservationResults.reduce((sum, res) => sum + res.requestedQuantity, 0)
    };
  }

  async processPaymentWithFraudDetection(orderData, user, session, transactionResults) {
    console.log(`Processing payment with fraud detection for order amount: ${orderData.totalAmount}`);
    
    // Fraud detection analysis within transaction
    const fraudScore = await this.calculateFraudScore(orderData, user, session);
    
    if (fraudScore > 0.8) {
      return {
        success: false,
        reason: `Transaction flagged for fraud (score: ${fraudScore})`,
        fraudScore: fraudScore
      };
    }

    // Process payment (in real system, this would integrate with payment gateway)
    const paymentRecord = {
      _id: `payment_${transactionResults.transactionId}`,
      orderId: transactionResults.transactionId,
      userId: user._id,
      amount: orderData.totalAmount,
      originalAmount: orderData.originalTotal || orderData.totalAmount,
      paymentMethod: orderData.paymentMethod,
      fraudScore: fraudScore,
      
      // Payment processing details
      authorizationId: `auth_${require('crypto').randomUUID()}`,
      captureId: `capture_${require('crypto').randomUUID()}`,
      
      status: 'completed',
      processedAt: new Date(),
      
      // Enhanced payment metadata
      riskAssessment: {
        score: fraudScore,
        factors: await this.getFraudFactors(orderData, user),
        recommendation: fraudScore > 0.5 ? 'review' : 'approve'
      },
      
      processingFees: {
        gatewayFee: orderData.totalAmount * 0.029 + 0.30, // Typical payment gateway fee
        fraudProtectionFee: 0.05
      }
    };

    const insertResult = await this.collections.payments.insertOne(paymentRecord, { session });
    
    this.updateTransactionMetrics(transactionResults, 'payments', 'processPaymentWithFraudDetection', insertResult);

    console.log(`Payment processed successfully: ${paymentRecord._id}`);

    return {
      success: true,
      paymentId: paymentRecord._id,
      authorizationId: paymentRecord.authorizationId,
      captureId: paymentRecord.captureId,
      fraudScore: fraudScore,
      processingFees: paymentRecord.processingFees
    };
  }

  async createComprehensiveOrder(orderData, user, inventoryReservation, paymentResult, promotionResult, session, transactionResults) {
    console.log('Creating comprehensive order document...');
    
    const orderDocument = {
      _id: transactionResults.transactionId,
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      
      // Customer information
      customer: {
        userId: user._id,
        email: user.email,
        tier: user.tier,
        isReturningCustomer: user.orderCount > 0
      },
      
      // Order details
      items: orderData.items.map(item => ({
        ...item,
        allocation: inventoryReservation.reservations.find(r => r.productId === item.productId)?.allocatedFrom || []
      })),
      
      // Financial details
      pricing: {
        subtotal: orderData.originalTotal || orderData.totalAmount,
        discounts: promotionResult.discountsApplied || [],
        totalDiscount: promotionResult.totalDiscount || 0,
        finalAmount: orderData.totalAmount,
        tax: orderData.tax || 0,
        shipping: orderData.shipping || 0,
        total: orderData.totalAmount
      },
      
      // Payment information
      payment: {
        paymentId: paymentResult.paymentId,
        method: orderData.paymentMethod,
        status: 'completed',
        fraudScore: paymentResult.fraudScore,
        processedAt: new Date()
      },
      
      // Inventory allocation
      inventory: {
        reservationId: inventoryReservation.reservationId,
        totalItemsReserved: inventoryReservation.totalReservedItems,
        reservationDetails: inventoryReservation.reservations
      },
      
      // Order lifecycle
      status: 'confirmed',
      lifecycle: {
        createdAt: new Date(),
        confirmedAt: new Date(),
        estimatedFulfillmentDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
        estimatedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week
      },
      
      // Shipping information
      shipping: {
        address: orderData.shippingAddress,
        method: orderData.shippingMethod || 'standard',
        trackingNumber: null, // Will be updated when shipped
        carrier: orderData.carrier || 'fedex'
      },
      
      // Transaction metadata
      transaction: {
        transactionId: transactionResults.transactionId,
        sessionId: session.id ? session.id.toString() : null,
        source: orderData.source || 'web',
        channel: orderData.channel || 'direct'
      }
    };

    const insertResult = await this.collections.orders.insertOne(orderDocument, { session });
    
    this.updateTransactionMetrics(transactionResults, 'orders', 'createComprehensiveOrder', insertResult);

    console.log(`Order created successfully: ${orderDocument.orderNumber}`);

    return orderDocument;
  }

  async updateUserLoyaltyAndTier(userId, orderAmount, orderItems, session, transactionResults) {
    console.log(`Updating loyalty points and tier for user: ${userId}`);
    
    // Calculate loyalty points based on complex rules
    const basePoints = Math.floor(orderAmount); // 1 point per dollar
    const bonusPoints = this.calculateBonusPoints(orderItems, orderAmount);
    const totalPoints = basePoints + bonusPoints;

    // Update loyalty points
    const loyaltyUpdate = await this.collections.loyalty.updateOne(
      { userId: userId },
      {
        $inc: {
          totalPointsEarned: totalPoints,
          availablePoints: totalPoints,
          lifetimeValue: orderAmount
        },
        $push: {
          pointsHistory: {
            orderId: transactionResults.transactionId,
            pointsEarned: totalPoints,
            reason: 'order_purchase',
            earnedAt: new Date()
          }
        },
        $set: {
          lastActivityAt: new Date()
        }
      },
      { 
        upsert: true,
        session 
      }
    );

    // Check for tier upgrades
    const loyaltyRecord = await this.collections.loyalty.findOne(
      { userId: userId },
      { session }
    );

    if (loyaltyRecord) {
      const newTier = this.calculateUserTier(loyaltyRecord.lifetimeValue, loyaltyRecord.totalPointsEarned);
      
      if (newTier !== loyaltyRecord.currentTier) {
        await this.collections.users.updateOne(
          { _id: userId },
          {
            $set: { tier: newTier },
            $push: {
              tierHistory: {
                previousTier: loyaltyRecord.currentTier,
                newTier: newTier,
                upgradedAt: new Date(),
                triggeredBy: transactionResults.transactionId
              }
            }
          },
          { session }
        );

        await this.collections.loyalty.updateOne(
          { userId: userId },
          { $set: { currentTier: newTier } },
          { session }
        );
      }
    }

    this.updateTransactionMetrics(transactionResults, 'loyalty', 'updateUserLoyaltyAndTier', loyaltyUpdate);

    console.log(`Awarded ${totalPoints} loyalty points to user ${userId}`);

    return {
      pointsAwarded: totalPoints,
      basePoints: basePoints,
      bonusPoints: bonusPoints,
      newTier: loyaltyRecord?.currentTier || 'bronze'
    };
  }

  async createComprehensiveAuditTrail(transactionId, orderData, user, paymentResult, inventoryReservation, promotionResult, session, transactionResults) {
    console.log('Creating comprehensive audit trail...');
    
    const auditRecord = {
      _id: `audit_${transactionId}`,
      transactionId: transactionId,
      auditType: 'order_processing',
      
      // Transaction context
      context: {
        userId: user._id,
        userEmail: user.email,
        userTier: user.tier,
        sessionId: session.id ? session.id.toString() : null,
        source: orderData.source || 'web',
        userAgent: orderData.userAgent,
        ipAddress: orderData.ipAddress
      },
      
      // Detailed operation log
      operations: transactionResults.operations.map(op => ({
        ...op,
        timestamp: new Date()
      })),
      
      // Financial audit trail
      financial: {
        originalAmount: orderData.originalTotal || orderData.totalAmount,
        finalAmount: orderData.totalAmount,
        discountsApplied: promotionResult.discountsApplied || [],
        totalDiscount: promotionResult.totalDiscount || 0,
        paymentMethod: orderData.paymentMethod,
        fraudScore: paymentResult.fraudScore,
        processingFees: paymentResult.processingFees
      },
      
      // Inventory audit trail
      inventory: {
        reservationId: inventoryReservation.reservationId,
        itemsReserved: inventoryReservation.totalReservedItems,
        allocationDetails: inventoryReservation.reservations
      },
      
      // Compliance and regulatory data
      compliance: {
        dataProcessingConsent: orderData.dataProcessingConsent || false,
        marketingConsent: orderData.marketingConsent || false,
        privacyPolicyVersion: orderData.privacyPolicyVersion || '1.0',
        termsOfServiceVersion: orderData.termsOfServiceVersion || '1.0'
      },
      
      // Transaction metrics
      performance: {
        transactionDurationMs: transactionResults.metrics.durationMs || 0,
        documentsModified: transactionResults.metrics.documentsModified,
        collectionsAffected: transactionResults.metrics.collectionsAffected,
        operationsExecuted: transactionResults.operations.length
      },
      
      // Audit metadata
      auditedAt: new Date(),
      retentionDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
      status: 'completed'
    };

    const insertResult = await this.collections.audit.insertOne(auditRecord, { session });
    
    this.updateTransactionMetrics(transactionResults, 'audit', 'createComprehensiveAuditTrail', insertResult);

    console.log(`Audit trail created: ${auditRecord._id}`);

    return auditRecord;
  }

  // Helper methods for transaction processing

  async calculateFraudScore(orderData, user, session) {
    // Simplified fraud scoring algorithm
    let fraudScore = 0.0;

    // Velocity checks
    const recentOrderCount = await this.collections.orders.countDocuments({
      'customer.userId': user._id,
      'lifecycle.createdAt': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }, { session });
    
    if (recentOrderCount > 5) fraudScore += 0.3;
    
    // Amount-based risk
    if (orderData.totalAmount > user.averageOrderValue * 3) {
      fraudScore += 0.2;
    }
    
    // Time-based patterns
    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 6) fraudScore += 0.1; // Unusual hours
    
    // Geographic risk (simplified)
    if (orderData.ipCountry !== user.country) {
      fraudScore += 0.15;
    }

    return Math.min(fraudScore, 1.0);
  }

  async getFraudFactors(orderData, user) {
    return [
      { factor: 'velocity_check', weight: 0.3 },
      { factor: 'amount_anomaly', weight: 0.2 },
      { factor: 'time_pattern', weight: 0.1 },
      { factor: 'geographic_risk', weight: 0.15 }
    ];
  }

  calculateBonusPoints(orderItems, orderAmount) {
    let bonusPoints = 0;
    
    // Category-based bonus points
    for (const item of orderItems) {
      if (item.category === 'electronics') bonusPoints += item.quantity * 2;
      else if (item.category === 'premium') bonusPoints += item.quantity * 3;
    }
    
    // Order size bonus
    if (orderAmount > 500) bonusPoints += 50;
    else if (orderAmount > 200) bonusPoints += 20;
    
    return bonusPoints;
  }

  calculateUserTier(lifetimeValue, totalPoints) {
    if (lifetimeValue > 10000 && totalPoints > 5000) return 'platinum';
    else if (lifetimeValue > 5000 && totalPoints > 2500) return 'gold';
    else if (lifetimeValue > 1000 && totalPoints > 500) return 'silver';
    else return 'bronze';
  }

  updateTransactionMetrics(transactionResults, collection, operation, result = {}) {
    transactionResults.operations.push({
      collection: collection,
      operation: operation,
      documentsModified: result.modifiedCount || result.insertedCount || result.upsertedCount || 1,
      timestamp: new Date()
    });
    
    if (result.modifiedCount || result.insertedCount || result.upsertedCount) {
      transactionResults.metrics.documentsModified += result.modifiedCount || result.insertedCount || result.upsertedCount;
    }
    
    const uniqueCollections = new Set(transactionResults.operations.map(op => op.collection));
    transactionResults.metrics.collectionsAffected = uniqueCollections.size;
  }

  // Advanced transaction patterns and error handling

  async executeWithRetry(transactionFunction, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await transactionFunction();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (this.isRetryableError(error) && attempt < maxRetries) {
          const delay = this.retryConfig.retryDelayMs * Math.pow(this.retryConfig.backoffFactor, attempt - 1);
          console.log(`Transaction attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    // MongoDB transient transaction errors that can be retried
    const retryableErrorCodes = [
      'TransientTransactionError',
      'UnknownTransactionCommitResult',
      'WriteConflict',
      'LockTimeout'
    ];
    
    return error.hasErrorLabel && retryableErrorCodes.some(label => error.hasErrorLabel(label));
  }

  async getTransactionStatus(transactionId) {
    // Check transaction completion status across collections
    const collections = ['orders', 'payments', 'audit'];
    const status = {};
    
    for (const collectionName of collections) {
      const collection = this.collections[collectionName];
      const document = await collection.findOne({ 
        $or: [
          { _id: transactionId },
          { transactionId: transactionId },
          { orderId: transactionId }
        ]
      });
      
      status[collectionName] = document ? 'completed' : 'missing';
    }
    
    return status;
  }

  async close() {
    // Close database connections
    if (client) {
      await client.close();
    }
  }
}

// Benefits of MongoDB Multi-Document ACID Transactions:
// - Full ACID compliance with automatic rollback on transaction failure
// - Multi-document atomicity across collections within single database
// - Strong consistency guarantees with configurable read and write concerns
// - Built-in retry logic for transient errors and network issues
// - Automatic deadlock detection and resolution
// - Snapshot isolation preventing dirty reads and write conflicts
// - Comprehensive transaction state management without application complexity
// - Performance optimization through write batching and connection pooling
// - Cross-shard transaction support in sharded environments
// - SQL-compatible transaction management through QueryLeaf integration

module.exports = {
  MongoTransactionManager
};
```

## Understanding MongoDB Transaction Architecture

### Advanced Transaction Patterns and Error Handling

Implement sophisticated transaction management for production applications:

```javascript
// Production-ready transaction patterns with advanced error handling and monitoring
class ProductionTransactionManager extends MongoTransactionManager {
  constructor(db, config = {}) {
    super(db);
    
    this.productionConfig = {
      ...config,
      transactionTimeoutMs: config.transactionTimeoutMs || 60000,
      maxConcurrentTransactions: config.maxConcurrentTransactions || 100,
      deadlockDetectionEnabled: true,
      performanceMonitoringEnabled: true,
      automaticRetryEnabled: true
    };
    
    this.activeTransactions = new Map();
    this.transactionMetrics = new Map();
    this.deadlockDetector = new DeadlockDetector();
  }

  async executeBusinessTransaction(transactionType, transactionData, options = {}) {
    console.log(`Executing ${transactionType} business transaction...`);
    
    const transactionContext = {
      id: require('crypto').randomUUID(),
      type: transactionType,
      data: transactionData,
      options: options,
      startTime: new Date(),
      status: 'started',
      retryCount: 0,
      operations: [],
      checkpoints: []
    };

    // Register active transaction
    this.activeTransactions.set(transactionContext.id, transactionContext);

    try {
      // Execute transaction with comprehensive error handling
      const result = await this.executeWithComprehensiveRetry(async () => {
        return await this.executeTransactionByType(transactionContext);
      }, transactionContext);

      transactionContext.status = 'completed';
      transactionContext.endTime = new Date();
      transactionContext.durationMs = transactionContext.endTime - transactionContext.startTime;

      // Record performance metrics
      await this.recordTransactionMetrics(transactionContext, result);

      console.log(`Transaction ${transactionContext.id} completed in ${transactionContext.durationMs}ms`);
      return result;

    } catch (error) {
      transactionContext.status = 'failed';
      transactionContext.endTime = new Date();
      transactionContext.error = error;
      
      // Record failure metrics
      await this.recordTransactionFailure(transactionContext, error);
      
      throw error;
    } finally {
      // Clean up active transaction
      this.activeTransactions.delete(transactionContext.id);
    }
  }

  async executeTransactionByType(transactionContext) {
    const { type, data, options } = transactionContext;
    
    switch (type) {
      case 'order_processing':
        return await this.processComplexOrderTransaction(data, options);
        
      case 'inventory_transfer':
        return await this.executeInventoryTransfer(data, transactionContext);
        
      case 'bulk_user_update':
        return await this.executeBulkUserUpdate(data, transactionContext);
        
      case 'financial_reconciliation':
        return await this.executeFinancialReconciliation(data, transactionContext);
        
      default:
        throw new Error(`Unknown transaction type: ${type}`);
    }
  }

  async executeInventoryTransfer(transferData, transactionContext) {
    const session = client.startSession();
    const transferResult = {
      transferId: transactionContext.id,
      sourceWarehouse: transferData.sourceWarehouse,
      targetWarehouse: transferData.targetWarehouse,
      itemsTransferred: [],
      success: false
    };

    try {
      await session.withTransaction(async () => {
        // Validate source warehouse inventory
        for (const item of transferData.items) {
          const sourceInventory = await this.collections.inventory.findOne({
            warehouseId: transferData.sourceWarehouse,
            productId: item.productId,
            availableQuantity: { $gte: item.quantity }
          }, { session });

          if (!sourceInventory) {
            throw new Error(`Insufficient inventory in source warehouse for product ${item.productId}`);
          }

          // Remove from source warehouse
          await this.collections.inventory.updateOne(
            { 
              _id: sourceInventory._id,
              availableQuantity: { $gte: item.quantity }
            },
            {
              $inc: { 
                availableQuantity: -item.quantity,
                transferOutQuantity: item.quantity
              },
              $push: {
                transferHistory: {
                  transferId: transactionContext.id,
                  type: 'outbound',
                  quantity: item.quantity,
                  targetWarehouse: transferData.targetWarehouse,
                  transferredAt: new Date()
                }
              }
            },
            { session }
          );

          // Add to target warehouse
          await this.collections.inventory.updateOne(
            {
              warehouseId: transferData.targetWarehouse,
              productId: item.productId
            },
            {
              $inc: { 
                availableQuantity: item.quantity,
                transferInQuantity: item.quantity
              },
              $push: {
                transferHistory: {
                  transferId: transactionContext.id,
                  type: 'inbound',
                  quantity: item.quantity,
                  sourceWarehouse: transferData.sourceWarehouse,
                  transferredAt: new Date()
                }
              }
            },
            { 
              upsert: true,
              session 
            }
          );

          transferResult.itemsTransferred.push({
            productId: item.productId,
            quantity: item.quantity,
            transferredAt: new Date()
          });
        }

        // Create transfer record
        await this.collections.transfers.insertOne({
          _id: transactionContext.id,
          sourceWarehouse: transferData.sourceWarehouse,
          targetWarehouse: transferData.targetWarehouse,
          items: transferResult.itemsTransferred,
          status: 'completed',
          transferredAt: new Date(),
          transferredBy: transferData.transferredBy
        }, { session });

      }, this.transactionConfig);

      transferResult.success = true;
      return transferResult;

    } finally {
      await session.endSession();
    }
  }

  async executeBulkUserUpdate(updateData, transactionContext) {
    const session = client.startSession();
    const updateResult = {
      updateId: transactionContext.id,
      usersUpdated: 0,
      updatesFailed: 0,
      success: false
    };

    try {
      await session.withTransaction(async () => {
        const bulkOperations = [];

        // Build bulk operations
        for (const userUpdate of updateData.updates) {
          bulkOperations.push({
            updateOne: {
              filter: { _id: userUpdate.userId },
              update: {
                $set: userUpdate.updates,
                $push: {
                  updateHistory: {
                    updateId: transactionContext.id,
                    updates: userUpdate.updates,
                    updatedAt: new Date(),
                    updatedBy: updateData.updatedBy
                  }
                }
              }
            }
          });
        }

        // Execute bulk operation within transaction
        const bulkResult = await this.collections.users.bulkWrite(
          bulkOperations,
          { session, ordered: false }
        );

        updateResult.usersUpdated = bulkResult.modifiedCount;
        updateResult.updatesFailed = updateData.updates.length - bulkResult.modifiedCount;

        // Log bulk update
        await this.collections.bulk_operations.insertOne({
          _id: transactionContext.id,
          operationType: 'bulk_user_update',
          targetCount: updateData.updates.length,
          successCount: bulkResult.modifiedCount,
          failureCount: updateResult.updatesFailed,
          executedAt: new Date(),
          executedBy: updateData.updatedBy
        }, { session });

      }, this.transactionConfig);

      updateResult.success = true;
      return updateResult;

    } finally {
      await session.endSession();
    }
  }

  async executeWithComprehensiveRetry(transactionFunction, transactionContext) {
    let lastError;
    const maxRetries = this.productionConfig.maxRetries || 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        transactionContext.retryCount = attempt - 1;
        return await transactionFunction();
      } catch (error) {
        lastError = error;
        
        // Analyze error and determine retry strategy
        const retryDecision = await this.analyzeErrorForRetry(error, attempt, maxRetries, transactionContext);
        
        if (retryDecision.shouldRetry) {
          console.log(`Transaction ${transactionContext.id} attempt ${attempt} failed, retrying: ${error.message}`);
          await this.executeRetryDelay(retryDecision.delayMs);
          continue;
        }
        
        // Error is not retryable or max retries reached
        break;
      }
    }
    
    // All retries exhausted
    console.error(`Transaction ${transactionContext.id} failed after ${maxRetries} attempts`);
    throw lastError;
  }

  async analyzeErrorForRetry(error, attempt, maxRetries, transactionContext) {
    const retryableErrors = [
      'TransientTransactionError',
      'UnknownTransactionCommitResult',
      'WriteConflict',
      'TemporarilyUnavailable'
    ];

    const isTransientError = error.hasErrorLabel && 
      retryableErrors.some(label => error.hasErrorLabel(label));
    
    const isTimeoutError = error.code === 50 || error.codeName === 'MaxTimeMSExpired';
    const isNetworkError = error.name === 'MongoNetworkError';
    
    // Check for deadlock
    const isDeadlock = await this.deadlockDetector.isDeadlock(error, transactionContext);
    if (isDeadlock) {
      await this.resolveDeadlock(transactionContext);
    }

    const shouldRetry = (isTransientError || isTimeoutError || isNetworkError || isDeadlock) && 
                       attempt < maxRetries;

    let delayMs = 100;
    if (shouldRetry) {
      // Exponential backoff with jitter
      const baseDelay = this.retryConfig.retryDelayMs || 100;
      const backoffFactor = this.retryConfig.backoffFactor || 2;
      delayMs = baseDelay * Math.pow(backoffFactor, attempt - 1);
      
      // Add jitter to prevent thundering herd
      delayMs += Math.random() * 50;
    }

    return {
      shouldRetry: shouldRetry,
      delayMs: delayMs,
      errorType: isTransientError ? 'transient' : 
                isTimeoutError ? 'timeout' : 
                isNetworkError ? 'network' : 
                isDeadlock ? 'deadlock' : 'permanent'
    };
  }

  async executeRetryDelay(delayMs) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  async recordTransactionMetrics(transactionContext, result) {
    const metrics = {
      transactionId: transactionContext.id,
      transactionType: transactionContext.type,
      durationMs: transactionContext.durationMs,
      retryCount: transactionContext.retryCount,
      operationCount: transactionContext.operations.length,
      documentsModified: result.metrics?.documentsModified || 0,
      collectionsAffected: result.metrics?.collectionsAffected || 0,
      success: true,
      recordedAt: new Date()
    };

    await this.collections.transaction_metrics.insertOne(metrics);
    
    // Update running averages
    this.updateRunningMetrics(transactionContext.type, metrics);
  }

  async recordTransactionFailure(transactionContext, error) {
    const failureMetrics = {
      transactionId: transactionContext.id,
      transactionType: transactionContext.type,
      durationMs: transactionContext.endTime - transactionContext.startTime,
      retryCount: transactionContext.retryCount,
      errorType: error.name,
      errorCode: error.code,
      errorMessage: error.message,
      success: false,
      recordedAt: new Date()
    };

    await this.collections.transaction_failures.insertOne(failureMetrics);
  }

  updateRunningMetrics(transactionType, metrics) {
    if (!this.transactionMetrics.has(transactionType)) {
      this.transactionMetrics.set(transactionType, {
        totalTransactions: 0,
        totalDurationMs: 0,
        successfulTransactions: 0,
        averageDurationMs: 0
      });
    }

    const typeMetrics = this.transactionMetrics.get(transactionType);
    typeMetrics.totalTransactions++;
    typeMetrics.totalDurationMs += metrics.durationMs;
    
    if (metrics.success) {
      typeMetrics.successfulTransactions++;
    }
    
    typeMetrics.averageDurationMs = typeMetrics.totalDurationMs / typeMetrics.totalTransactions;
  }

  getTransactionMetrics(transactionType = null) {
    if (transactionType) {
      return this.transactionMetrics.get(transactionType) || null;
    }
    
    return Object.fromEntries(this.transactionMetrics);
  }

  async resolveDeadlock(transactionContext) {
    console.log(`Resolving deadlock for transaction ${transactionContext.id}`);
    
    // Implement deadlock resolution strategy
    // This could involve backing off, reordering operations, or other strategies
    const delayMs = Math.random() * 1000; // Random delay to break deadlock
    await this.executeRetryDelay(delayMs);
  }
}

// Deadlock detection system
class DeadlockDetector {
  constructor() {
    this.waitForGraph = new Map();
    this.transactionLocks = new Map();
  }

  async isDeadlock(error, transactionContext) {
    // Simplified deadlock detection based on error patterns
    const deadlockIndicators = [
      'LockTimeout',
      'WriteConflict', 
      'DeadlockDetected'
    ];

    return error.codeName && deadlockIndicators.includes(error.codeName);
  }

  async detectDeadlockCycle(transactionId) {
    // Implement cycle detection in wait-for graph
    // This is a simplified implementation
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (node) => {
      visited.add(node);
      recursionStack.add(node);

      const dependencies = this.waitForGraph.get(node) || [];
      for (const dependency of dependencies) {
        if (!visited.has(dependency)) {
          if (hasCycle(dependency)) return true;
        } else if (recursionStack.has(dependency)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    return hasCycle(transactionId);
  }
}
```

## SQL-Style Transaction Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB transaction management and ACID operations:

```sql
-- QueryLeaf transaction management with SQL-familiar syntax

-- Begin complex multi-document transaction with ACID guarantees
BEGIN TRANSACTION order_processing WITH (
  isolation_level = 'snapshot',
  write_concern = { w = 'majority', j = true },
  read_concern = { level = 'majority' },
  timeout = '60 seconds',
  retry_policy = {
    max_attempts = 3,
    backoff_strategy = 'exponential',
    base_delay = '100ms'
  }
);

-- Transaction Operation 1: Validate and update user account
UPDATE users 
SET 
  credit_used = credit_used + @order_total,
  total_order_value = total_order_value + @order_total,
  order_count = order_count + 1,
  last_order_date = CURRENT_TIMESTAMP,
  daily_spending = ARRAY_APPEND(
    daily_spending,
    DOCUMENT(
      'date', CURRENT_DATE,
      'amount', @order_total
    )
  )
WHERE _id = @user_id 
  AND credit_limit - credit_used >= @order_total
  AND (
    SELECT amount 
    FROM UNNEST(daily_spending) AS ds 
    WHERE ds.date = CURRENT_DATE
  ) + @order_total <= daily_spending_limit;

-- Verify user update succeeded
IF @@ROWCOUNT = 0 THEN
  ROLLBACK TRANSACTION;
  THROW 'INSUFFICIENT_CREDIT', 'User does not have sufficient credit or daily limit exceeded';
END IF;

-- Transaction Operation 2: Apply promotions and calculate discounts
WITH applicable_promotions AS (
  SELECT 
    p._id as promotion_id,
    p.name as promotion_name,
    p.type as discount_type,
    p.discount_percentage,
    p.discount_amount,
    p.max_discount,
    
    -- Calculate discount amount based on promotion type
    CASE p.type
      WHEN 'percentage' THEN 
        LEAST(@order_total * p.discount_percentage / 100, COALESCE(p.max_discount, @order_total))
      WHEN 'fixed_amount' THEN 
        LEAST(p.discount_amount, @order_total)
      ELSE 0
    END as calculated_discount
    
  FROM promotions p
  WHERE p.status = 'active'
    AND p.start_date <= CURRENT_TIMESTAMP
    AND p.end_date >= CURRENT_TIMESTAMP
    AND (@order_total >= p.minimum_order_amount OR p.minimum_order_amount IS NULL)
    AND (
      p.applicable_to_all = true OR
      @user_id = ANY(p.applicable_to_users) OR
      @user_tier = ANY(p.applicable_to_user_tiers)
    )
  ORDER BY calculated_discount DESC
  LIMIT 3  -- Apply maximum 3 promotions
)

UPDATE promotions 
SET 
  usage_count = usage_count + 1,
  recent_usage = ARRAY_APPEND(
    recent_usage,
    DOCUMENT(
      'user_id', @user_id,
      'order_id', @transaction_id,
      'discount_amount', ap.calculated_discount,
      'used_at', CURRENT_TIMESTAMP
    )
  )
FROM applicable_promotions ap
WHERE promotions._id = ap.promotion_id;

-- Calculate final order amount after discounts
SET @final_order_total = @order_total - (
  SELECT COALESCE(SUM(calculated_discount), 0) 
  FROM applicable_promotions
);

-- Transaction Operation 3: Reserve inventory with FIFO allocation
WITH inventory_allocation AS (
  SELECT 
    i._id as inventory_id,
    i.product_id,
    i.warehouse_location,
    i.available_quantity,
    i.unit_cost,
    oi.requested_quantity,
    
    -- Calculate allocation using FIFO
    ROW_NUMBER() OVER (
      PARTITION BY i.product_id 
      ORDER BY i.created_at ASC
    ) as allocation_order,
    
    -- Running total for allocation
    SUM(i.available_quantity) OVER (
      PARTITION BY i.product_id 
      ORDER BY i.created_at ASC 
      ROWS UNBOUNDED PRECEDING
    ) as cumulative_available
    
  FROM inventory i
  JOIN UNNEST(@order_items) AS oi ON i.product_id = oi.product_id
  WHERE i.available_quantity > 0 
    AND i.status = 'active'
),

allocation_plan AS (
  SELECT 
    inventory_id,
    product_id,
    warehouse_location,
    requested_quantity,
    
    -- Calculate exact quantity to allocate from each inventory record
    CASE 
      WHEN cumulative_available - available_quantity >= requested_quantity THEN 0
      WHEN cumulative_available >= requested_quantity THEN 
        requested_quantity - (cumulative_available - available_quantity)
      ELSE available_quantity
    END as quantity_to_allocate,
    
    unit_cost
    
  FROM inventory_allocation
  WHERE cumulative_available > 
    LAG(cumulative_available, 1, 0) OVER (PARTITION BY product_id ORDER BY allocation_order)
)

-- Execute inventory reservations
UPDATE inventory 
SET 
  available_quantity = available_quantity - ap.quantity_to_allocate,
  reserved_quantity = reserved_quantity + ap.quantity_to_allocate,
  reservations = ARRAY_APPEND(
    reservations,
    DOCUMENT(
      'reservation_id', CONCAT(@transaction_id, '_', ap.product_id, '_', ap.inventory_id),
      'order_id', @transaction_id,
      'quantity', ap.quantity_to_allocate,
      'reserved_at', CURRENT_TIMESTAMP,
      'expires_at', CURRENT_TIMESTAMP + INTERVAL '30 minutes',
      'status', 'active'
    )
  )
FROM allocation_plan ap
WHERE inventory._id = ap.inventory_id
  AND inventory.available_quantity >= ap.quantity_to_allocate;

-- Verify all inventory was successfully reserved
IF (
  SELECT SUM(quantity_to_allocate) FROM allocation_plan
) != (
  SELECT SUM(requested_quantity) FROM UNNEST(@order_items)
) THEN
  ROLLBACK TRANSACTION;
  THROW 'INSUFFICIENT_INVENTORY', 'Unable to reserve sufficient inventory for all items';
END IF;

-- Transaction Operation 4: Process payment with fraud detection
WITH fraud_assessment AS (
  SELECT 
    @user_id as user_id,
    @final_order_total as order_amount,
    
    -- Calculate fraud score based on multiple factors
    CASE
      -- Velocity check: orders in last 24 hours
      WHEN (
        SELECT COUNT(*) 
        FROM orders 
        WHERE customer.user_id = @user_id 
          AND lifecycle.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      ) > 5 THEN 0.3
      ELSE 0.0
    END +
    
    -- Amount anomaly check
    CASE
      WHEN @final_order_total > (
        SELECT AVG(pricing.final_amount) * 3 
        FROM orders 
        WHERE customer.user_id = @user_id
      ) THEN 0.2
      ELSE 0.0
    END +
    
    -- Time pattern check (unusual hours)
    CASE
      WHEN EXTRACT(HOUR FROM CURRENT_TIMESTAMP) BETWEEN 2 AND 6 THEN 0.1
      ELSE 0.0
    END +
    
    -- Geographic risk check
    CASE
      WHEN @ip_country != (SELECT country FROM users WHERE _id = @user_id) THEN 0.15
      ELSE 0.0
    END as fraud_score
)

-- Insert payment record with fraud assessment
INSERT INTO payments (
  _id,
  order_id,
  user_id,
  amount,
  original_amount,
  payment_method,
  authorization_id,
  capture_id,
  fraud_score,
  risk_assessment,
  status,
  processed_at
)
SELECT 
  CONCAT('payment_', @transaction_id),
  @transaction_id,
  @user_id,
  @final_order_total,
  @order_total,
  @payment_method,
  CONCAT('auth_', GENERATE_UUID()),
  CONCAT('capture_', GENERATE_UUID()),
  fa.fraud_score,
  DOCUMENT(
    'score', fa.fraud_score,
    'factors', ARRAY[
      'velocity_check',
      'amount_anomaly', 
      'time_pattern',
      'geographic_risk'
    ],
    'recommendation', 
    CASE WHEN fa.fraud_score > 0.5 THEN 'review' ELSE 'approve' END
  ),
  'completed',
  CURRENT_TIMESTAMP
FROM fraud_assessment fa
WHERE fa.fraud_score <= 0.8; -- Reject transactions with high fraud scores

-- Verify payment was processed (not rejected for fraud)
IF @@ROWCOUNT = 0 THEN
  ROLLBACK TRANSACTION;
  THROW 'FRAUD_DETECTED', 'Transaction flagged for potential fraud and rejected';
END IF;

-- Transaction Operation 5: Create comprehensive order document
INSERT INTO orders (
  _id,
  order_number,
  
  -- Customer information
  customer,
  
  -- Order items with inventory allocation
  items,
  
  -- Pricing breakdown  
  pricing,
  
  -- Payment information
  payment,
  
  -- Inventory allocation details
  inventory,
  
  -- Order lifecycle tracking
  status,
  lifecycle,
  
  -- Shipping information
  shipping,
  
  -- Transaction metadata
  transaction
)
VALUES (
  @transaction_id,
  CONCAT('ORD-', UNIX_TIMESTAMP(), '-', UPPER(RANDOM_STRING(6))),
  
  -- Customer document
  DOCUMENT(
    'user_id', @user_id,
    'email', (SELECT email FROM users WHERE _id = @user_id),
    'tier', (SELECT tier FROM users WHERE _id = @user_id),
    'is_returning_customer', (SELECT order_count > 0 FROM users WHERE _id = @user_id)
  ),
  
  -- Items with allocation details
  (
    SELECT ARRAY_AGG(
      DOCUMENT(
        'product_id', oi.product_id,
        'quantity', oi.quantity,
        'price', oi.price,
        'allocation', (
          SELECT ARRAY_AGG(
            DOCUMENT(
              'inventory_id', ap.inventory_id,
              'warehouse_location', ap.warehouse_location,
              'quantity', ap.quantity_to_allocate,
              'unit_cost', ap.unit_cost
            )
          )
          FROM allocation_plan ap
          WHERE ap.product_id = oi.product_id
        )
      )
    )
    FROM UNNEST(@order_items) AS oi
  ),
  
  -- Pricing breakdown document
  DOCUMENT(
    'subtotal', @order_total,
    'discounts', (
      SELECT ARRAY_AGG(
        DOCUMENT(
          'promotion_id', promotion_id,
          'promotion_name', promotion_name,
          'discount_amount', calculated_discount,
          'applied_at', CURRENT_TIMESTAMP
        )
      )
      FROM applicable_promotions
    ),
    'total_discount', @order_total - @final_order_total,
    'final_amount', @final_order_total,
    'tax', @tax_amount,
    'shipping', @shipping_cost,
    'total', @final_order_total + @tax_amount + @shipping_cost
  ),
  
  -- Payment document
  DOCUMENT(
    'payment_id', CONCAT('payment_', @transaction_id),
    'method', @payment_method,
    'status', 'completed',
    'fraud_score', (SELECT fraud_score FROM fraud_assessment),
    'processed_at', CURRENT_TIMESTAMP
  ),
  
  -- Inventory allocation document
  DOCUMENT(
    'reservation_id', @transaction_id,
    'total_items_reserved', (SELECT SUM(quantity_to_allocate) FROM allocation_plan),
    'reservation_details', (
      SELECT ARRAY_AGG(
        DOCUMENT(
          'product_id', product_id,
          'requested_quantity', requested_quantity,
          'allocated_from', ARRAY_AGG(
            DOCUMENT(
              'inventory_id', inventory_id,
              'warehouse_location', warehouse_location,
              'quantity', quantity_to_allocate,
              'unit_cost', unit_cost
            )
          )
        )
      )
      FROM allocation_plan
      GROUP BY product_id, requested_quantity
    )
  ),
  
  -- Order status and lifecycle
  'confirmed',
  DOCUMENT(
    'created_at', CURRENT_TIMESTAMP,
    'confirmed_at', CURRENT_TIMESTAMP,
    'estimated_fulfillment_date', CURRENT_TIMESTAMP + INTERVAL '2 days',
    'estimated_delivery_date', CURRENT_TIMESTAMP + INTERVAL '7 days'
  ),
  
  -- Shipping information
  DOCUMENT(
    'address', @shipping_address,
    'method', COALESCE(@shipping_method, 'standard'),
    'carrier', COALESCE(@carrier, 'fedex'),
    'tracking_number', NULL
  ),
  
  -- Transaction metadata
  DOCUMENT(
    'transaction_id', @transaction_id,
    'source', COALESCE(@order_source, 'web'),
    'channel', COALESCE(@order_channel, 'direct'),
    'user_agent', @user_agent,
    'ip_address', @ip_address
  )
);

-- Transaction Operation 6: Update loyalty points and tier status
WITH loyalty_calculation AS (
  SELECT 
    @user_id as user_id,
    FLOOR(@final_order_total) as base_points, -- 1 point per dollar
    
    -- Calculate bonus points based on items and categories
    (
      SELECT COALESCE(SUM(
        CASE 
          WHEN oi.category = 'electronics' THEN oi.quantity * 2
          WHEN oi.category = 'premium' THEN oi.quantity * 3
          ELSE 0
        END
      ), 0)
      FROM UNNEST(@order_items) AS oi
    ) +
    
    -- Order size bonus
    CASE 
      WHEN @final_order_total > 500 THEN 50
      WHEN @final_order_total > 200 THEN 20
      ELSE 0
    END as bonus_points
),

tier_calculation AS (
  SELECT 
    lc.user_id,
    lc.base_points + lc.bonus_points as total_points_earned,
    
    -- Calculate new tier based on lifetime value and points
    CASE
      WHEN (
        SELECT lifetime_value + @final_order_total FROM loyalty WHERE user_id = @user_id
      ) > 10000 AND (
        SELECT total_points_earned + (lc.base_points + lc.bonus_points) FROM loyalty WHERE user_id = @user_id
      ) > 5000 THEN 'platinum'
      
      WHEN (
        SELECT lifetime_value + @final_order_total FROM loyalty WHERE user_id = @user_id
      ) > 5000 AND (
        SELECT total_points_earned + (lc.base_points + lc.bonus_points) FROM loyalty WHERE user_id = @user_id
      ) > 2500 THEN 'gold'
      
      WHEN (
        SELECT lifetime_value + @final_order_total FROM loyalty WHERE user_id = @user_id
      ) > 1000 AND (
        SELECT total_points_earned + (lc.base_points + lc.bonus_points) FROM loyalty WHERE user_id = @user_id
      ) > 500 THEN 'silver'
      
      ELSE 'bronze'
    END as new_tier
    
  FROM loyalty_calculation lc
)

-- Update loyalty points
INSERT INTO loyalty (
  user_id,
  total_points_earned,
  available_points,
  lifetime_value,
  current_tier,
  points_history,
  last_activity_at
)
SELECT 
  tc.user_id,
  tc.total_points_earned,
  tc.total_points_earned,
  @final_order_total,
  tc.new_tier,
  ARRAY[
    DOCUMENT(
      'order_id', @transaction_id,
      'points_earned', tc.total_points_earned,
      'reason', 'order_purchase',
      'earned_at', CURRENT_TIMESTAMP
    )
  ],
  CURRENT_TIMESTAMP
FROM tier_calculation tc
ON DUPLICATE KEY UPDATE
  total_points_earned = total_points_earned + tc.total_points_earned,
  available_points = available_points + tc.total_points_earned,
  lifetime_value = lifetime_value + @final_order_total,
  current_tier = tc.new_tier,
  points_history = ARRAY_APPEND(
    points_history,
    DOCUMENT(
      'order_id', @transaction_id,
      'points_earned', tc.total_points_earned,
      'reason', 'order_purchase',
      'earned_at', CURRENT_TIMESTAMP
    )
  ),
  last_activity_at = CURRENT_TIMESTAMP;

-- Update user tier if changed
UPDATE users 
SET 
  tier = tc.new_tier,
  tier_history = ARRAY_APPEND(
    tier_history,
    DOCUMENT(
      'previous_tier', (SELECT current_tier FROM loyalty WHERE user_id = @user_id),
      'new_tier', tc.new_tier,
      'upgraded_at', CURRENT_TIMESTAMP,
      'triggered_by', @transaction_id
    )
  )
FROM tier_calculation tc
WHERE users._id = @user_id 
  AND users.tier != tc.new_tier;

-- Transaction Operation 7: Create comprehensive audit trail
INSERT INTO audit (
  _id,
  transaction_id,
  audit_type,
  
  -- Transaction context
  context,
  
  -- Detailed operation log  
  operations,
  
  -- Financial audit trail
  financial,
  
  -- Inventory audit trail
  inventory_audit,
  
  -- Compliance data
  compliance,
  
  -- Performance metrics
  performance,
  
  -- Audit metadata
  audited_at,
  retention_date,
  status
)
VALUES (
  CONCAT('audit_', @transaction_id),
  @transaction_id,
  'order_processing',
  
  -- Context document
  DOCUMENT(
    'user_id', @user_id,
    'user_email', (SELECT email FROM users WHERE _id = @user_id),
    'user_tier', (SELECT tier FROM users WHERE _id = @user_id),
    'source', @order_source,
    'user_agent', @user_agent,
    'ip_address', @ip_address
  ),
  
  -- Operations log
  ARRAY[
    DOCUMENT('collection', 'users', 'operation', 'validateAndUpdateUserAccount', 'timestamp', CURRENT_TIMESTAMP),
    DOCUMENT('collection', 'promotions', 'operation', 'applyPromotionsAndDiscounts', 'timestamp', CURRENT_TIMESTAMP),
    DOCUMENT('collection', 'inventory', 'operation', 'reserveInventoryWithAllocation', 'timestamp', CURRENT_TIMESTAMP),
    DOCUMENT('collection', 'payments', 'operation', 'processPaymentWithFraudDetection', 'timestamp', CURRENT_TIMESTAMP),
    DOCUMENT('collection', 'orders', 'operation', 'createComprehensiveOrder', 'timestamp', CURRENT_TIMESTAMP),
    DOCUMENT('collection', 'loyalty', 'operation', 'updateUserLoyaltyAndTier', 'timestamp', CURRENT_TIMESTAMP)
  ],
  
  -- Financial audit
  DOCUMENT(
    'original_amount', @order_total,
    'final_amount', @final_order_total,
    'discounts_applied', (SELECT COALESCE(COUNT(*), 0) FROM applicable_promotions),
    'total_discount', @order_total - @final_order_total,
    'payment_method', @payment_method,
    'fraud_score', (SELECT fraud_score FROM fraud_assessment)
  ),
  
  -- Inventory audit
  DOCUMENT(
    'reservation_id', @transaction_id,
    'items_reserved', (SELECT SUM(quantity_to_allocate) FROM allocation_plan),
    'allocation_details', (
      SELECT ARRAY_AGG(
        DOCUMENT(
          'product_id', product_id,
          'quantity_allocated', SUM(quantity_to_allocate),
          'warehouse_locations', ARRAY_AGG(DISTINCT warehouse_location)
        )
      )
      FROM allocation_plan
      GROUP BY product_id
    )
  ),
  
  -- Compliance information
  DOCUMENT(
    'data_processing_consent', COALESCE(@data_processing_consent, false),
    'marketing_consent', COALESCE(@marketing_consent, false),
    'privacy_policy_version', COALESCE(@privacy_policy_version, '1.0'),
    'terms_of_service_version', COALESCE(@terms_of_service_version, '1.0')
  ),
  
  -- Performance tracking
  DOCUMENT(
    'operations_executed', 7,
    'collections_affected', 6,
    'documents_modified', @@TOTAL_DOCUMENTS_MODIFIED
  ),
  
  -- Audit metadata
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '7 years', -- Retention period
  'completed'
);

-- Commit the entire transaction atomically
COMMIT TRANSACTION order_processing;

-- Advanced transaction monitoring and analysis queries
WITH transaction_performance_analysis AS (
  SELECT 
    DATE_TRUNC('hour', audited_at) as hour_bucket,
    audit_type as transaction_type,
    
    -- Performance metrics
    COUNT(*) as transaction_count,
    AVG(CAST(performance->>'operations_executed' AS INTEGER)) as avg_operations,
    AVG(CAST(performance->>'collections_affected' AS INTEGER)) as avg_collections,
    AVG(CAST(performance->>'documents_modified' AS INTEGER)) as avg_documents_modified,
    
    -- Financial metrics
    AVG(CAST(financial->>'final_amount' AS DECIMAL)) as avg_transaction_amount,
    SUM(CAST(financial->>'final_amount' AS DECIMAL)) as total_transaction_volume,
    AVG(CAST(financial->>'fraud_score' AS DECIMAL)) as avg_fraud_score,
    
    -- Success rate calculation
    COUNT(*) FILTER (WHERE status = 'completed') as successful_transactions,
    COUNT(*) FILTER (WHERE status != 'completed') as failed_transactions,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*), 2
    ) as success_rate_pct
    
  FROM audit
  WHERE audited_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', audited_at), audit_type
),

fraud_analysis AS (
  SELECT 
    DATE_TRUNC('day', audited_at) as day_bucket,
    
    -- Fraud detection metrics
    COUNT(*) as total_transactions,
    COUNT(*) FILTER (WHERE CAST(financial->>'fraud_score' AS DECIMAL) > 0.5) as high_risk_transactions,
    COUNT(*) FILTER (WHERE CAST(financial->>'fraud_score' AS DECIMAL) > 0.8) as rejected_transactions,
    AVG(CAST(financial->>'fraud_score' AS DECIMAL)) as avg_fraud_score,
    MAX(CAST(financial->>'fraud_score' AS DECIMAL)) as max_fraud_score,
    
    -- Risk distribution
    COUNT(*) FILTER (WHERE CAST(financial->>'fraud_score' AS DECIMAL) BETWEEN 0 AND 0.2) as low_risk,
    COUNT(*) FILTER (WHERE CAST(financial->>'fraud_score' AS DECIMAL) BETWEEN 0.2 AND 0.5) as medium_risk,
    COUNT(*) FILTER (WHERE CAST(financial->>'fraud_score' AS DECIMAL) BETWEEN 0.5 AND 0.8) as high_risk,
    COUNT(*) FILTER (WHERE CAST(financial->>'fraud_score' AS DECIMAL) > 0.8) as critical_risk
    
  FROM audit
  WHERE audited_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    AND audit_type = 'order_processing'
  GROUP BY DATE_TRUNC('day', audited_at)
),

inventory_impact_analysis AS (
  SELECT 
    JSON_EXTRACT(inv_detail.value, '$.product_id') as product_id,
    
    -- Inventory allocation metrics
    SUM(CAST(JSON_EXTRACT(inv_detail.value, '$.quantity_allocated') AS INTEGER)) as total_allocated,
    COUNT(DISTINCT transaction_id) as allocation_transactions,
    AVG(CAST(JSON_EXTRACT(inv_detail.value, '$.quantity_allocated') AS INTEGER)) as avg_allocation_per_transaction,
    
    -- Warehouse distribution
    COUNT(DISTINCT JSON_EXTRACT(loc.value, '$')) as warehouses_used,
    JSON_ARRAYAGG(DISTINCT JSON_EXTRACT(loc.value, '$')) as warehouse_list
    
  FROM audit,
    JSON_TABLE(
      inventory_audit->'$.allocation_details', '$[*]'
      COLUMNS (
        value JSON PATH '$'
      )
    ) as inv_detail,
    JSON_TABLE(
      JSON_EXTRACT(inv_detail.value, '$.warehouse_locations'), '$[*]'
      COLUMNS (
        value JSON PATH '$'
      )
    ) as loc
  WHERE audited_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND audit_type = 'order_processing'
  GROUP BY JSON_EXTRACT(inv_detail.value, '$.product_id')
  ORDER BY total_allocated DESC
  LIMIT 20
)

-- Comprehensive transaction monitoring dashboard
SELECT 
  'PERFORMANCE_SUMMARY' as metric_type,
  tpa.hour_bucket,
  tpa.transaction_type,
  tpa.transaction_count,
  tpa.avg_operations,
  tpa.avg_transaction_amount,
  tpa.success_rate_pct,
  
  -- Performance grading
  CASE 
    WHEN tpa.success_rate_pct >= 99.5 AND tpa.avg_operations <= 10 THEN 'EXCELLENT'
    WHEN tpa.success_rate_pct >= 99.0 AND tpa.avg_operations <= 15 THEN 'GOOD'
    WHEN tpa.success_rate_pct >= 95.0 THEN 'ACCEPTABLE'
    ELSE 'NEEDS_IMPROVEMENT'
  END as performance_grade

FROM transaction_performance_analysis tpa

UNION ALL

SELECT 
  'FRAUD_SUMMARY' as metric_type,
  fa.day_bucket::timestamp,
  'fraud_analysis',
  fa.total_transactions,
  fa.avg_fraud_score,
  fa.max_fraud_score,
  ROUND(fa.rejected_transactions * 100.0 / fa.total_transactions, 2) as rejection_rate_pct,
  
  -- Risk level assessment
  CASE
    WHEN fa.avg_fraud_score < 0.2 THEN 'LOW_RISK'
    WHEN fa.avg_fraud_score < 0.5 THEN 'MEDIUM_RISK'  
    WHEN fa.avg_fraud_score < 0.8 THEN 'HIGH_RISK'
    ELSE 'CRITICAL_RISK'
  END as risk_level

FROM fraud_analysis fa

UNION ALL

SELECT 
  'INVENTORY_SUMMARY' as metric_type,
  CURRENT_TIMESTAMP,
  'inventory_allocation',
  iia.allocation_transactions,
  iia.total_allocated,
  iia.avg_allocation_per_transaction,
  iia.warehouses_used,
  
  -- Allocation efficiency
  CASE
    WHEN iia.warehouses_used = 1 THEN 'SINGLE_WAREHOUSE'
    WHEN iia.warehouses_used <= 3 THEN 'EFFICIENT_DISTRIBUTION'
    ELSE 'FRAGMENTED_ALLOCATION'
  END as allocation_pattern

FROM inventory_impact_analysis iia
ORDER BY metric_type, hour_bucket DESC;

-- Real-time transaction health monitoring
CREATE MATERIALIZED VIEW transaction_health_dashboard AS
WITH real_time_metrics AS (
  SELECT 
    DATE_TRUNC('minute', audited_at) as minute_bucket,
    audit_type,
    
    -- Real-time performance metrics
    COUNT(*) as transactions_per_minute,
    AVG(CAST(performance->>'operations_executed' AS INTEGER)) as avg_operations,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_transactions,
    COUNT(*) FILTER (WHERE status != 'completed') as failed_transactions,
    
    -- Financial metrics
    SUM(CAST(financial->>'final_amount' AS DECIMAL)) as revenue_per_minute,
    AVG(CAST(financial->>'fraud_score' AS DECIMAL)) as avg_fraud_score,
    
    -- Operational metrics
    AVG(CAST(performance->>'documents_modified' AS INTEGER)) as avg_documents_per_transaction
    
  FROM audit
  WHERE audited_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  GROUP BY DATE_TRUNC('minute', audited_at), audit_type
),

health_indicators AS (
  SELECT 
    minute_bucket,
    audit_type,
    transactions_per_minute,
    successful_transactions,
    failed_transactions,
    revenue_per_minute,
    avg_fraud_score,
    
    -- Calculate success rate
    CASE WHEN transactions_per_minute > 0 THEN
      ROUND(successful_transactions * 100.0 / transactions_per_minute, 2)
    ELSE 0 END as success_rate,
    
    -- Detect anomalies
    CASE 
      WHEN failed_transactions > successful_transactions THEN 'CRITICAL_FAILURE_RATE'
      WHEN successful_transactions = 0 AND transactions_per_minute > 0 THEN 'COMPLETE_FAILURE'
      WHEN avg_fraud_score > 0.6 THEN 'HIGH_FRAUD_ACTIVITY' 
      WHEN transactions_per_minute > 100 THEN 'HIGH_VOLUME_ALERT'
      WHEN transactions_per_minute = 0 AND EXTRACT(HOUR FROM CURRENT_TIMESTAMP) BETWEEN 9 AND 21 THEN 'NO_TRANSACTIONS_ALERT'
      ELSE 'NORMAL'
    END as health_status,
    
    -- Performance trend
    LAG(successful_transactions) OVER (
      PARTITION BY audit_type 
      ORDER BY minute_bucket
    ) as prev_minute_success,
    
    LAG(failed_transactions) OVER (
      PARTITION BY audit_type 
      ORDER BY minute_bucket  
    ) as prev_minute_failures
    
  FROM real_time_metrics
)

SELECT 
  minute_bucket,
  audit_type,
  transactions_per_minute,
  success_rate,
  revenue_per_minute,
  health_status,
  avg_fraud_score,
  
  -- Trend analysis
  CASE 
    WHEN prev_minute_success IS NOT NULL THEN
      successful_transactions - prev_minute_success
    ELSE 0
  END as success_trend,
  
  CASE 
    WHEN prev_minute_failures IS NOT NULL THEN  
      failed_transactions - prev_minute_failures
    ELSE 0
  END as failure_trend,
  
  -- Alert priority
  CASE health_status
    WHEN 'COMPLETE_FAILURE' THEN 1
    WHEN 'CRITICAL_FAILURE_RATE' THEN 2
    WHEN 'HIGH_FRAUD_ACTIVITY' THEN 3
    WHEN 'HIGH_VOLUME_ALERT' THEN 4
    WHEN 'NO_TRANSACTIONS_ALERT' THEN 5
    ELSE 10
  END as alert_priority,
  
  -- Recommendations
  CASE health_status
    WHEN 'COMPLETE_FAILURE' THEN 'IMMEDIATE: Check system connectivity and database status'
    WHEN 'CRITICAL_FAILURE_RATE' THEN 'HIGH: Review error logs and investigate transaction failures'
    WHEN 'HIGH_FRAUD_ACTIVITY' THEN 'MEDIUM: Review fraud detection rules and recent transactions'
    WHEN 'HIGH_VOLUME_ALERT' THEN 'LOW: Monitor system resources and scaling capabilities'
    WHEN 'NO_TRANSACTIONS_ALERT' THEN 'MEDIUM: Check application availability and user access'
    ELSE 'Continue monitoring'
  END as recommendation

FROM health_indicators
WHERE minute_bucket >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
ORDER BY alert_priority ASC, minute_bucket DESC;

-- QueryLeaf provides comprehensive transaction management:
-- 1. SQL-familiar syntax for complex MongoDB multi-document transactions
-- 2. Full ACID compliance with automatic rollback on failure
-- 3. Advanced business logic integration within transactional contexts
-- 4. Comprehensive audit trail generation with regulatory compliance
-- 5. Real-time fraud detection and risk assessment within transactions
-- 6. Sophisticated inventory allocation and reservation management
-- 7. Dynamic promotions and loyalty points calculation in transactions
-- 8. Performance monitoring and alerting for transaction health
-- 9. Automated retry logic and error handling for transient failures
-- 10. Production-ready transaction patterns with comprehensive monitoring
```

## Best Practices for MongoDB Transaction Implementation

### Transaction Design Principles

Essential guidelines for effective MongoDB transaction usage:

1. **Minimize Transaction Scope**: Keep transactions as short as possible to reduce lock contention and improve performance
2. **Idempotent Operations**: Design transaction operations to be safely retryable in case of transient failures
3. **Proper Error Handling**: Implement comprehensive error handling with appropriate retry logic for transient errors
4. **Read and Write Concerns**: Configure appropriate read and write concerns for consistency requirements
5. **Timeout Management**: Set reasonable timeouts to prevent long-running transactions from blocking resources
6. **Performance Monitoring**: Monitor transaction performance and identify bottlenecks or long-running operations

### Production Optimization Strategies

Optimize MongoDB transactions for production environments:

1. **Connection Pooling**: Use connection pooling to efficiently manage database connections across transaction sessions
2. **Index Optimization**: Ensure proper indexing for all queries within transactions to minimize lock duration
3. **Batch Operations**: Use bulk operations where possible to reduce the number of round trips and improve performance
4. **Monitoring and Alerting**: Implement comprehensive monitoring for transaction success rates, latency, and error patterns
5. **Capacity Planning**: Plan for transaction concurrency and ensure sufficient resources for peak transaction loads
6. **Testing and Validation**: Regularly test transaction logic under load to identify potential issues before production

## Conclusion

MongoDB's multi-document ACID transactions provide comprehensive atomic operations that eliminate the complexity and consistency challenges of traditional NoSQL coordination approaches. The sophisticated transaction management, automatic retry logic, and comprehensive error handling ensure reliable business operations while maintaining the flexibility and scalability benefits of MongoDB's document model.

Key MongoDB Transaction benefits include:

- **Full ACID Compliance**: Complete atomicity, consistency, isolation, and durability guarantees across multiple documents
- **Automatic Rollback**: Built-in rollback functionality eliminates complex application-level coordination requirements
- **Cross-Collection Atomicity**: Multi-document operations spanning different collections within the same database
- **Retry Logic**: Intelligent retry mechanisms for transient errors and network issues
- **Performance Optimization**: Advanced transaction management with connection pooling and batch operations
- **Comprehensive Monitoring**: Built-in transaction metrics and monitoring capabilities for production environments

Whether you're building financial applications, e-commerce platforms, or complex workflow systems, MongoDB's ACID transactions with QueryLeaf's familiar SQL interface provide the foundation for reliable, consistent, and scalable multi-document operations.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB transaction operations while providing SQL-familiar syntax for complex multi-document business logic, comprehensive error handling, and advanced transaction patterns. ACID compliance, automatic retry logic, and production monitoring capabilities are seamlessly handled through familiar SQL constructs, making sophisticated transactional applications both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust transaction capabilities with SQL-style operations makes it an ideal platform for applications requiring both NoSQL flexibility and traditional database transaction guarantees, ensuring your business operations maintain consistency and reliability as they scale and evolve.