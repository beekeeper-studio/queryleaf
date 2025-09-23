---
title: "MongoDB Transactions and ACID Compliance: Building Reliable Distributed Systems with SQL-Style Transaction Management"
description: "Master MongoDB multi-document transactions for ACID compliance, distributed system reliability, and data consistency. Learn transaction patterns, isolation levels, and SQL-familiar transaction management for mission-critical applications."
date: 2025-09-22
tags: [mongodb, transactions, acid, distributed-systems, consistency, sql, reliability]
---

# MongoDB Transactions and ACID Compliance: Building Reliable Distributed Systems with SQL-Style Transaction Management

Modern distributed applications require robust data consistency guarantees and transaction support to ensure business-critical operations maintain data integrity across complex workflows. Traditional NoSQL databases often sacrifice ACID properties for scalability, forcing developers to implement complex application-level consistency mechanisms that are error-prone and difficult to maintain.

MongoDB Multi-Document Transactions provide full ACID compliance across multiple documents and collections, enabling developers to build reliable distributed systems with the same consistency guarantees as traditional relational databases while maintaining MongoDB's horizontal scalability and flexible document model. Unlike eventual consistency models that require complex conflict resolution, MongoDB transactions ensure immediate consistency with familiar commit/rollback semantics.

## The Traditional Distributed Consistency Challenge

Conventional approaches to maintaining consistency in distributed systems have significant limitations for modern applications:

```sql
-- Traditional relational approach - limited scalability and flexibility

-- PostgreSQL distributed transaction with complex state management
BEGIN;

-- Order creation with inventory checks
WITH inventory_check AS (
  SELECT 
    product_id,
    available_quantity,
    reserved_quantity,
    CASE 
      WHEN available_quantity >= 5 THEN true 
      ELSE false 
    END as sufficient_inventory
  FROM inventory 
  WHERE product_id = 'prod_12345'
  FOR UPDATE
),
order_validation AS (
  SELECT 
    user_id,
    account_balance,
    credit_limit,
    account_status,
    CASE 
      WHEN account_status = 'active' AND (account_balance + credit_limit) >= 299.99 THEN true
      ELSE false
    END as payment_valid
  FROM user_accounts 
  WHERE user_id = 'user_67890'
  FOR UPDATE
)
INSERT INTO orders (
  order_id,
  user_id, 
  product_id,
  quantity,
  total_amount,
  order_status,
  created_at
)
SELECT 
  'order_' || nextval('order_seq'),
  'user_67890',
  'prod_12345', 
  5,
  299.99,
  CASE 
    WHEN ic.sufficient_inventory AND ov.payment_valid THEN 'confirmed'
    ELSE 'failed'
  END,
  CURRENT_TIMESTAMP
FROM inventory_check ic, order_validation ov;

-- Update inventory with complex validation
UPDATE inventory 
SET 
  available_quantity = available_quantity - 5,
  reserved_quantity = reserved_quantity + 5,
  updated_at = CURRENT_TIMESTAMP
WHERE product_id = 'prod_12345' 
  AND available_quantity >= 5;

-- Update user account balance
UPDATE user_accounts 
SET 
  account_balance = account_balance - 299.99,
  last_transaction = CURRENT_TIMESTAMP
WHERE user_id = 'user_67890' 
  AND account_status = 'active'
  AND (account_balance + credit_limit) >= 299.99;

-- Create order items with foreign key constraints
INSERT INTO order_items (
  order_id,
  product_id,
  quantity,
  unit_price,
  line_total
)
SELECT 
  o.order_id,
  'prod_12345',
  5,
  59.99,
  299.95
FROM orders o 
WHERE o.user_id = 'user_67890' 
  AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute';

-- Create audit trail
INSERT INTO transaction_audit (
  transaction_id,
  transaction_type,
  user_id,
  order_id,
  amount,
  status,
  created_at
)
SELECT 
  txid_current(),
  'order_creation',
  'user_67890',
  o.order_id,
  299.99,
  o.order_status,
  CURRENT_TIMESTAMP
FROM orders o 
WHERE o.user_id = 'user_67890' 
  AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute';

-- Complex validation before commit
DO $$
DECLARE
  order_count INTEGER;
  inventory_count INTEGER;
  balance_valid BOOLEAN;
BEGIN
  -- Verify order was created
  SELECT COUNT(*) INTO order_count
  FROM orders 
  WHERE user_id = 'user_67890' 
    AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute';
  
  -- Verify inventory was updated
  SELECT COUNT(*) INTO inventory_count
  FROM inventory 
  WHERE product_id = 'prod_12345' 
    AND reserved_quantity >= 5;
  
  -- Verify account balance
  SELECT (account_balance >= 0) INTO balance_valid
  FROM user_accounts 
  WHERE user_id = 'user_67890';
  
  IF order_count = 0 OR inventory_count = 0 OR NOT balance_valid THEN
    RAISE EXCEPTION 'Transaction validation failed';
  END IF;
END
$$;

COMMIT;

-- Problems with traditional distributed transactions:
-- 1. Complex multi-table validation and rollback logic
-- 2. Poor performance with long-running transactions and locks
-- 3. Difficulty scaling across multiple database instances
-- 4. Limited flexibility with rigid relational schema constraints
-- 5. Complex error handling and partial failure scenarios
-- 6. Manual coordination of distributed transaction state
-- 7. Poor integration with modern microservices architectures
-- 8. Limited support for document-based data structures
-- 9. Complex deadlock detection and resolution
-- 10. High operational overhead for distributed consistency

-- MySQL distributed transactions (even more limitations)
START TRANSACTION;

-- Basic order processing with limited validation
INSERT INTO mysql_orders (
  user_id, 
  product_id,
  quantity,
  amount,
  status,
  created_at
) VALUES (
  'user_67890',
  'prod_12345', 
  5,
  299.99,
  'pending',
  NOW()
);

-- Update inventory without proper validation
UPDATE mysql_inventory 
SET quantity = quantity - 5 
WHERE product_id = 'prod_12345' 
  AND quantity >= 5;

-- Update account balance
UPDATE mysql_accounts 
SET balance = balance - 299.99
WHERE user_id = 'user_67890' 
  AND balance >= 299.99;

-- Check if all updates succeeded
SELECT 
  (SELECT COUNT(*) FROM mysql_orders WHERE user_id = 'user_67890' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)) as order_created,
  (SELECT quantity FROM mysql_inventory WHERE product_id = 'prod_12345') as remaining_inventory,
  (SELECT balance FROM mysql_accounts WHERE user_id = 'user_67890') as remaining_balance;

COMMIT;

-- MySQL limitations:
-- - Limited JSON support for complex document structures  
-- - Basic transaction isolation levels
-- - Poor support for distributed transactions
-- - Limited cross-table validation capabilities
-- - Simple error handling and rollback mechanisms
-- - No native support for document relationships
-- - Minimal support for complex business logic in transactions
```

MongoDB Multi-Document Transactions provide comprehensive ACID compliance:

```javascript
// MongoDB Multi-Document Transactions - full ACID compliance with document flexibility
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_platform');

// Advanced transaction processing with complex business logic
class TransactionManager {
  constructor(db) {
    this.db = db;
    this.collections = {
      orders: db.collection('orders'),
      inventory: db.collection('inventory'),
      users: db.collection('users'),
      payments: db.collection('payments'),
      auditLog: db.collection('audit_log'),
      loyalty: db.collection('loyalty_program'),
      promotions: db.collection('promotions'),
      shipping: db.collection('shipping_addresses')
    };
    this.transactionOptions = {
      readPreference: 'primary',
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority', j: true }
    };
  }

  async processComplexOrder(orderData) {
    const session = client.startSession();
    
    try {
      // Start multi-document transaction with full ACID properties
      const result = await session.withTransaction(async () => {
        
        // Step 1: Validate and reserve inventory
        const inventoryResult = await this.validateAndReserveInventory(
          orderData.items, session
        );
        
        if (!inventoryResult.success) {
          throw new Error(`Insufficient inventory: ${inventoryResult.message}`);
        }

        // Step 2: Validate user account and payment method
        const userValidation = await this.validateUserAccount(
          orderData.userId, orderData.totalAmount, session
        );
        
        if (!userValidation.success) {
          throw new Error(`Payment validation failed: ${userValidation.message}`);
        }

        // Step 3: Apply promotions and calculate final pricing
        const pricingResult = await this.calculateFinalPricing(
          orderData, userValidation.user, session
        );

        // Step 4: Create order with complete transaction context
        const order = await this.createOrder({
          ...orderData,
          ...pricingResult,
          inventoryReservations: inventoryResult.reservations,
          userId: orderData.userId
        }, session);

        // Step 5: Process payment transaction
        const paymentResult = await this.processPaymentTransaction(
          order, userValidation.user.paymentMethods, session
        );

        if (!paymentResult.success) {
          throw new Error(`Payment processing failed: ${paymentResult.message}`);
        }

        // Step 6: Update user loyalty points
        await this.updateLoyaltyProgram(
          orderData.userId, pricingResult.finalAmount, session
        );

        // Step 7: Create shipping record
        await this.createShippingRecord(order, session);

        // Step 8: Create comprehensive audit trail
        await this.createTransactionAuditTrail({
          orderId: order._id,
          userId: orderData.userId,
          amount: pricingResult.finalAmount,
          inventoryChanges: inventoryResult.changes,
          paymentId: paymentResult.paymentId,
          timestamp: new Date()
        }, session);

        return {
          success: true,
          orderId: order._id,
          paymentId: paymentResult.paymentId,
          finalAmount: pricingResult.finalAmount,
          loyaltyPointsEarned: pricingResult.loyaltyPoints
        };

      }, this.transactionOptions);

      console.log('Complex order transaction completed successfully:', result);
      return result;

    } catch (error) {
      console.error('Transaction failed, automatic rollback initiated:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async validateAndReserveInventory(items, session) {
    console.log('Validating and reserving inventory for items:', items);
    
    const reservations = [];
    const changes = [];

    for (const item of items) {
      // Read current inventory state within transaction
      const inventoryDoc = await this.collections.inventory.findOne(
        { productId: item.productId },
        { session }
      );

      if (!inventoryDoc) {
        return {
          success: false,
          message: `Product not found: ${item.productId}`
        };
      }

      // Validate availability including existing reservations
      const availableQuantity = inventoryDoc.quantity - inventoryDoc.reservedQuantity;
      
      if (availableQuantity < item.quantity) {
        return {
          success: false,
          message: `Insufficient stock for ${item.productId}. Available: ${availableQuantity}, Requested: ${item.quantity}`
        };
      }

      // Reserve inventory within transaction
      const updateResult = await this.collections.inventory.updateOne(
        {
          productId: item.productId,
          quantity: { $gte: inventoryDoc.reservedQuantity + item.quantity }
        },
        {
          $inc: { reservedQuantity: item.quantity },
          $push: {
            reservationHistory: {
              reservationId: new ObjectId(),
              quantity: item.quantity,
              timestamp: new Date(),
              type: 'order_reservation'
            }
          },
          $set: { lastUpdated: new Date() }
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        return {
          success: false,
          message: `Failed to reserve inventory for ${item.productId}`
        };
      }

      reservations.push({
        productId: item.productId,
        quantityReserved: item.quantity,
        previousAvailable: availableQuantity
      });

      changes.push({
        productId: item.productId,
        action: 'reserved',
        quantity: item.quantity,
        newReservedQuantity: inventoryDoc.reservedQuantity + item.quantity
      });
    }

    return {
      success: true,
      reservations: reservations,
      changes: changes
    };
  }

  async validateUserAccount(userId, totalAmount, session) {
    console.log(`Validating user account: ${userId} for amount: ${totalAmount}`);
    
    // Fetch user data within transaction
    const user = await this.collections.users.findOne(
      { _id: userId },
      { session }
    );

    if (!user) {
      return {
        success: false,
        message: 'User account not found'
      };
    }

    // Validate account status
    if (user.accountStatus !== 'active') {
      return {
        success: false,
        message: `Account is ${user.accountStatus} - cannot process orders`
      };
    }

    // Validate payment methods
    if (!user.paymentMethods || user.paymentMethods.length === 0) {
      return {
        success: false,
        message: 'No valid payment methods on file'
      };
    }

    // Check credit limits and available balance
    const totalAvailableCredit = user.accountBalance + 
      user.paymentMethods.reduce((sum, pm) => sum + (pm.creditLimit || 0), 0);

    if (totalAvailableCredit < totalAmount) {
      return {
        success: false,
        message: `Insufficient funds. Available: ${totalAvailableCredit}, Required: ${totalAmount}`
      };
    }

    // Check for fraud indicators
    if (user.riskScore && user.riskScore > 0.8) {
      return {
        success: false,
        message: 'Transaction blocked due to high risk score'
      };
    }

    return {
      success: true,
      user: user,
      availableCredit: totalAvailableCredit
    };
  }

  async calculateFinalPricing(orderData, user, session) {
    console.log('Calculating final pricing with promotions and discounts');
    
    let totalAmount = orderData.subtotal;
    let discountAmount = 0;
    let loyaltyPoints = 0;
    const appliedPromotions = [];

    // Check for applicable promotions within transaction
    const activePromotions = await this.collections.promotions.find(
      {
        active: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        $or: [
          { applicableUsers: userId },
          { applicableUserTiers: user.loyaltyTier },
          { globalPromotion: true }
        ]
      },
      { session }
    ).toArray();

    // Apply best available promotion
    for (const promotion of activePromotions) {
      if (this.isPromotionApplicable(promotion, orderData, user)) {
        const promotionDiscount = this.calculatePromotionDiscount(promotion, totalAmount);
        
        if (promotionDiscount > discountAmount) {
          discountAmount = promotionDiscount;
          appliedPromotions.push({
            promotionId: promotion._id,
            promotionName: promotion.name,
            discountAmount: promotionDiscount,
            discountType: promotion.discountType
          });
        }
      }
    }

    // Calculate loyalty points earned
    const loyaltyMultiplier = user.loyaltyTier === 'gold' ? 1.5 : 
                            user.loyaltyTier === 'silver' ? 1.2 : 1.0;
    loyaltyPoints = Math.floor((totalAmount - discountAmount) * 0.01 * loyaltyMultiplier);

    // Calculate taxes and final amount
    const taxRate = orderData.shippingAddress?.taxRate || 0.08;
    const subtotalAfterDiscount = totalAmount - discountAmount;
    const taxAmount = subtotalAfterDiscount * taxRate;
    const finalAmount = subtotalAfterDiscount + taxAmount + (orderData.shippingCost || 0);

    return {
      originalAmount: totalAmount,
      discountAmount: discountAmount,
      taxAmount: taxAmount,
      shippingCost: orderData.shippingCost || 0,
      finalAmount: finalAmount,
      loyaltyPoints: loyaltyPoints,
      appliedPromotions: appliedPromotions
    };
  }

  async createOrder(orderData, session) {
    console.log('Creating order with full transaction context');
    
    const order = {
      _id: new ObjectId(),
      userId: orderData.userId,
      orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'confirmed',
      
      // Order items with detailed information
      items: orderData.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
        
        // Product snapshot for historical accuracy
        productSnapshot: {
          name: item.productName,
          description: item.description,
          category: item.category,
          sku: item.sku
        }
      })),
      
      // Pricing breakdown
      pricing: {
        subtotal: orderData.originalAmount,
        discountAmount: orderData.discountAmount,
        taxAmount: orderData.taxAmount,
        shippingCost: orderData.shippingCost,
        finalAmount: orderData.finalAmount
      },
      
      // Applied promotions
      promotions: orderData.appliedPromotions || [],
      
      // Customer information
      customer: {
        userId: orderData.userId,
        email: orderData.customerEmail,
        loyaltyTier: orderData.customerLoyaltyTier
      },
      
      // Shipping information
      shipping: {
        address: orderData.shippingAddress,
        method: orderData.shippingMethod,
        estimatedDelivery: orderData.estimatedDelivery,
        cost: orderData.shippingCost
      },
      
      // Order lifecycle
      lifecycle: {
        createdAt: new Date(),
        confirmedAt: new Date(),
        estimatedFulfillmentDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        status: 'confirmed'
      },
      
      // Transaction metadata
      transaction: {
        sessionId: session.id,
        ipAddress: orderData.ipAddress,
        userAgent: orderData.userAgent,
        referrer: orderData.referrer
      },
      
      // Inventory reservations
      inventoryReservations: orderData.inventoryReservations
    };

    const insertResult = await this.collections.orders.insertOne(order, { session });
    
    if (!insertResult.acknowledged) {
      throw new Error('Failed to create order');
    }

    return order;
  }

  async processPaymentTransaction(order, paymentMethods, session) {
    console.log(`Processing payment for order: ${order._id}`);
    
    // Select best payment method
    const primaryPaymentMethod = paymentMethods.find(pm => pm.primary) || paymentMethods[0];
    
    if (!primaryPaymentMethod) {
      return {
        success: false,
        message: 'No valid payment method available'
      };
    }

    // Create payment record within transaction
    const payment = {
      _id: new ObjectId(),
      orderId: order._id,
      userId: order.userId,
      amount: order.pricing.finalAmount,
      currency: 'USD',
      
      paymentMethod: {
        type: primaryPaymentMethod.type,
        maskedNumber: primaryPaymentMethod.maskedNumber,
        provider: primaryPaymentMethod.provider
      },
      
      status: 'completed', // Simulated successful payment
      
      transactionDetails: {
        authorizationCode: `AUTH_${Date.now()}`,
        transactionId: `TXN_${Math.random().toString(36).substr(2, 16)}`,
        processedAt: new Date(),
        processingFee: order.pricing.finalAmount * 0.029, // 2.9% processing fee
        
        // Risk assessment
        riskScore: Math.random() * 0.3, // Simulated low risk
        fraudChecks: {
          addressVerification: 'pass',
          cvvVerification: 'pass',
          velocityCheck: 'pass'
        }
      },
      
      // Gateway information
      gateway: {
        provider: 'stripe',
        gatewayTransactionId: `pi_${Math.random().toString(36).substr(2, 24)}`,
        gatewayFee: order.pricing.finalAmount * 0.029 + 0.30
      },
      
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const paymentResult = await this.collections.payments.insertOne(payment, { session });
    
    if (!paymentResult.acknowledged) {
      return {
        success: false,
        message: 'Payment processing failed'
      };
    }

    // Update user account balance if using account credit
    if (primaryPaymentMethod.type === 'account_balance') {
      await this.collections.users.updateOne(
        { _id: order.userId },
        {
          $inc: { accountBalance: -order.pricing.finalAmount },
          $push: {
            transactionHistory: {
              type: 'debit',
              amount: order.pricing.finalAmount,
              description: `Order payment: ${order.orderNumber}`,
              timestamp: new Date()
            }
          }
        },
        { session }
      );
    }

    return {
      success: true,
      paymentId: payment._id,
      transactionId: payment.transactionDetails.transactionId,
      amount: payment.amount
    };
  }

  async updateLoyaltyProgram(userId, orderAmount, session) {
    console.log(`Updating loyalty program for user: ${userId}`);
    
    // Calculate loyalty points (1% of order amount)
    const pointsEarned = Math.floor(orderAmount);
    
    // Update loyalty program within transaction
    const loyaltyUpdate = await this.collections.loyalty.updateOne(
      { userId: userId },
      {
        $inc: { 
          totalPoints: pointsEarned,
          lifetimePoints: pointsEarned,
          totalSpend: orderAmount
        },
        $push: {
          pointsHistory: {
            type: 'earned',
            points: pointsEarned,
            description: 'Order purchase',
            timestamp: new Date()
          }
        },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true, session }
    );

    // Check for tier upgrades
    const loyaltyAccount = await this.collections.loyalty.findOne(
      { userId: userId },
      { session }
    );

    if (loyaltyAccount) {
      const newTier = this.calculateLoyaltyTier(loyaltyAccount.totalSpend, loyaltyAccount.totalPoints);
      
      if (newTier !== loyaltyAccount.currentTier) {
        await this.collections.loyalty.updateOne(
          { userId: userId },
          {
            $set: { 
              currentTier: newTier,
              tierUpgradedAt: new Date()
            },
            $push: {
              tierHistory: {
                previousTier: loyaltyAccount.currentTier,
                newTier: newTier,
                upgradedAt: new Date()
              }
            }
          },
          { session }
        );

        // Update user's tier in main user document
        await this.collections.users.updateOne(
          { _id: userId },
          { $set: { loyaltyTier: newTier } },
          { session }
        );
      }
    }

    return {
      pointsEarned: pointsEarned,
      newTier: loyaltyAccount?.currentTier
    };
  }

  async createShippingRecord(order, session) {
    console.log(`Creating shipping record for order: ${order._id}`);
    
    const shippingRecord = {
      _id: new ObjectId(),
      orderId: order._id,
      userId: order.userId,
      
      shippingAddress: order.shipping.address,
      shippingMethod: order.shipping.method,
      
      status: 'pending',
      trackingNumber: null, // Will be assigned when shipped
      
      estimatedDelivery: order.shipping.estimatedDelivery,
      actualDelivery: null,
      
      carrier: this.selectShippingCarrier(order.shipping.method),
      
      shippingCost: order.shipping.cost,
      
      items: order.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        weight: item.estimatedWeight || 1, // Default weight
        dimensions: item.dimensions
      })),
      
      lifecycle: {
        createdAt: new Date(),
        status: 'pending',
        statusHistory: [{
          status: 'pending',
          timestamp: new Date(),
          note: 'Shipping record created'
        }]
      }
    };

    await this.collections.shipping.insertOne(shippingRecord, { session });
    return shippingRecord;
  }

  async createTransactionAuditTrail(auditData, session) {
    console.log('Creating comprehensive audit trail');
    
    const auditEntry = {
      _id: new ObjectId(),
      
      // Transaction identification
      transactionId: auditData.sessionId || new ObjectId(),
      transactionType: 'order_creation',
      
      // Entity information
      orderId: auditData.orderId,
      userId: auditData.userId,
      paymentId: auditData.paymentId,
      
      // Transaction details
      amount: auditData.amount,
      currency: 'USD',
      
      // Changes made
      changes: {
        orderCreated: {
          orderId: auditData.orderId,
          status: 'confirmed',
          timestamp: auditData.timestamp
        },
        inventoryChanges: auditData.inventoryChanges,
        paymentProcessed: {
          paymentId: auditData.paymentId,
          amount: auditData.amount,
          status: 'completed'
        },
        loyaltyUpdated: true
      },
      
      // Compliance and security
      compliance: {
        dataRetentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
        encryptionRequired: true,
        auditLevel: 'full'
      },
      
      // System metadata
      system: {
        applicationVersion: process.env.APP_VERSION || '1.0.0',
        nodeId: process.env.NODE_ID || 'node-1',
        environment: process.env.NODE_ENV || 'development'
      },
      
      timestamp: auditData.timestamp,
      createdAt: new Date()
    };

    await this.collections.auditLog.insertOne(auditEntry, { session });
    return auditEntry;
  }

  // Helper methods
  isPromotionApplicable(promotion, orderData, user) {
    // Implement promotion applicability logic
    if (promotion.minOrderAmount && orderData.subtotal < promotion.minOrderAmount) {
      return false;
    }
    
    if (promotion.applicableUserTiers && !promotion.applicableUserTiers.includes(user.loyaltyTier)) {
      return false;
    }
    
    if (promotion.maxUsesPerUser) {
      // Check usage count (would need to query promotion usage history)
      return true; // Simplified for example
    }
    
    return true;
  }

  calculatePromotionDiscount(promotion, orderAmount) {
    switch (promotion.discountType) {
      case 'percentage':
        return orderAmount * (promotion.discountValue / 100);
      case 'fixed_amount':
        return Math.min(promotion.discountValue, orderAmount);
      default:
        return 0;
    }
  }

  calculateLoyaltyTier(totalSpend, totalPoints) {
    if (totalSpend >= 10000) return 'platinum';
    if (totalSpend >= 5000) return 'gold';
    if (totalSpend >= 1000) return 'silver';
    return 'bronze';
  }

  selectShippingCarrier(shippingMethod) {
    const carrierMap = {
      'standard': 'USPS',
      'expedited': 'FedEx',
      'overnight': 'UPS',
      'two_day': 'FedEx'
    };
    return carrierMap[shippingMethod] || 'USPS';
  }

  // Advanced transaction patterns
  async processBulkTransactions(transactions) {
    console.log(`Processing ${transactions.length} bulk transactions`);
    
    const session = client.startSession();
    const results = [];
    
    try {
      await session.withTransaction(async () => {
        for (const transactionData of transactions) {
          try {
            const result = await this.processComplexOrder(transactionData);
            results.push({
              success: true,
              orderId: result.orderId,
              data: result
            });
          } catch (error) {
            results.push({
              success: false,
              error: error.message,
              transactionData: transactionData
            });
            
            // Decide whether to continue or abort entire batch
            if (error.critical) {
              throw error; // Abort entire batch
            }
          }
        }
      });
      
    } catch (error) {
      console.error('Bulk transaction failed:', error);
      throw error;
    } finally {
      await session.endSession();
    }
    
    return results;
  }

  async processCompensatingTransaction(originalOrderId, compensationType) {
    console.log(`Processing compensating transaction for order: ${originalOrderId}`);
    
    const session = client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        
        // Fetch original order
        const originalOrder = await this.collections.orders.findOne(
          { _id: originalOrderId },
          { session }
        );
        
        if (!originalOrder) {
          throw new Error('Original order not found');
        }

        switch (compensationType) {
          case 'full_refund':
            return await this.processFullRefund(originalOrder, session);
          case 'partial_refund':
            return await this.processPartialRefund(originalOrder, session);
          case 'order_cancellation':
            return await this.processOrderCancellation(originalOrder, session);
          default:
            throw new Error(`Unknown compensation type: ${compensationType}`);
        }
      });
      
    } finally {
      await session.endSession();
    }
  }

  async processFullRefund(originalOrder, session) {
    console.log(`Processing full refund for order: ${originalOrder._id}`);
    
    // Release inventory reservations
    for (const item of originalOrder.items) {
      await this.collections.inventory.updateOne(
        { productId: item.productId },
        {
          $inc: { reservedQuantity: -item.quantity },
          $push: {
            reservationHistory: {
              reservationId: new ObjectId(),
              quantity: -item.quantity,
              timestamp: new Date(),
              type: 'refund_release'
            }
          }
        },
        { session }
      );
    }

    // Process refund payment
    const refundPayment = {
      _id: new ObjectId(),
      originalOrderId: originalOrder._id,
      originalPaymentId: originalOrder.paymentId,
      userId: originalOrder.userId,
      amount: originalOrder.pricing.finalAmount,
      currency: 'USD',
      type: 'refund',
      status: 'completed',
      processedAt: new Date(),
      createdAt: new Date()
    };

    await this.collections.payments.insertOne(refundPayment, { session });

    // Update order status
    await this.collections.orders.updateOne(
      { _id: originalOrder._id },
      {
        $set: {
          status: 'refunded',
          'lifecycle.refundedAt': new Date(),
          'lifecycle.status': 'refunded'
        },
        $push: {
          'lifecycle.statusHistory': {
            status: 'refunded',
            timestamp: new Date(),
            note: 'Full refund processed'
          }
        }
      },
      { session }
    );

    // Update user account balance
    await this.collections.users.updateOne(
      { _id: originalOrder.userId },
      {
        $inc: { accountBalance: originalOrder.pricing.finalAmount },
        $push: {
          transactionHistory: {
            type: 'credit',
            amount: originalOrder.pricing.finalAmount,
            description: `Refund for order: ${originalOrder.orderNumber}`,
            timestamp: new Date()
          }
        }
      },
      { session }
    );

    // Create audit trail
    await this.createTransactionAuditTrail({
      orderId: originalOrder._id,
      userId: originalOrder.userId,
      amount: originalOrder.pricing.finalAmount,
      type: 'full_refund',
      timestamp: new Date()
    }, session);

    return {
      success: true,
      refundId: refundPayment._id,
      amount: originalOrder.pricing.finalAmount
    };
  }
}

// Benefits of MongoDB Multi-Document Transactions:
// - Full ACID compliance across multiple documents and collections
// - Automatic rollback on failure with consistent data state
// - Session-based transaction isolation with configurable read/write concerns
// - Support for complex business logic within transaction boundaries
// - Seamless integration with MongoDB's document model and flexible schemas
// - Distributed transaction support across replica sets and sharded clusters  
// - Rich error handling and transaction state management
// - Integration with MongoDB's change streams for real-time transaction monitoring
// - Optimistic concurrency control with automatic retry mechanisms
// - Native support for document relationships and embedded data structures

module.exports = {
  TransactionManager
};
```

## Understanding MongoDB Transaction Architecture

### Advanced Transaction Patterns and Isolation Levels

Implement sophisticated transaction patterns for different business scenarios:

```javascript
// Advanced transaction patterns and isolation management
class AdvancedTransactionPatterns {
  constructor(db) {
    this.db = db;
    this.isolationLevels = {
      readUncommitted: { level: 'available' },
      readCommitted: { level: 'local' },
      repeatableRead: { level: 'majority' },
      serializable: { level: 'linearizable' }
    };
  }

  async demonstrateIsolationLevels() {
    console.log('Demonstrating MongoDB transaction isolation levels...');
    
    // Read Committed isolation (MongoDB default)
    const readCommittedSession = client.startSession();
    try {
      await readCommittedSession.withTransaction(async () => {
        
        // Reads only committed data
        const userData = await this.db.collection('users').findOne(
          { _id: 'user123' },
          { 
            session: readCommittedSession,
            readConcern: this.isolationLevels.readCommitted
          }
        );
        
        // Updates are isolated from other transactions
        await this.db.collection('users').updateOne(
          { _id: 'user123' },
          { $set: { lastActivity: new Date() } },
          { session: readCommittedSession }
        );
        
      }, {
        readConcern: this.isolationLevels.readCommitted,
        writeConcern: { w: 'majority', j: true }
      });
    } finally {
      await readCommittedSession.endSession();
    }

    // Snapshot isolation for consistent reads
    const snapshotSession = client.startSession();
    try {
      await snapshotSession.withTransaction(async () => {
        
        // All reads within transaction see consistent snapshot
        const orders = await this.db.collection('orders').find(
          { userId: 'user123' },
          { session: snapshotSession }
        ).toArray();
        
        const inventory = await this.db.collection('inventory').find(
          { productId: { $in: orders.map(o => o.productId) } },
          { session: snapshotSession }
        ).toArray();
        
        // Both reads see data from same point in time
        console.log(`Found ${orders.length} orders and ${inventory.length} inventory items`);
        
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true }
      });
    } finally {
      await snapshotSession.endSession();
    }
  }

  async implementSagaPattern(sagaSteps) {
    // Saga pattern for distributed transaction coordination
    console.log('Implementing Saga pattern for distributed transactions...');
    
    const sagaId = new ObjectId();
    const saga = {
      _id: sagaId,
      status: 'started',
      steps: sagaSteps,
      currentStep: 0,
      compensations: [],
      createdAt: new Date()
    };

    // Create saga record
    await this.db.collection('sagas').insertOne(saga);
    
    try {
      for (let i = 0; i < sagaSteps.length; i++) {
        const step = sagaSteps[i];
        
        console.log(`Executing saga step ${i + 1}/${sagaSteps.length}: ${step.name}`);
        
        const session = client.startSession();
        try {
          await session.withTransaction(async () => {
            
            // Execute step within transaction
            const stepResult = await this.executeSagaStep(step, session);
            
            // Update saga progress
            await this.db.collection('sagas').updateOne(
              { _id: sagaId },
              {
                $set: {
                  currentStep: i + 1,
                  status: i === sagaSteps.length - 1 ? 'completed' : 'in_progress',
                  lastUpdated: new Date()
                },
                $push: {
                  stepResults: {
                    stepIndex: i,
                    stepName: step.name,
                    result: stepResult,
                    completedAt: new Date()
                  }
                }
              },
              { session }
            );
            
          });
        } finally {
          await session.endSession();
        }
      }
      
      console.log(`Saga ${sagaId} completed successfully`);
      return { success: true, sagaId };
      
    } catch (error) {
      console.error(`Saga ${sagaId} failed at step ${saga.currentStep}:`, error);
      
      // Execute compensating transactions
      await this.compensateSaga(sagaId, saga.currentStep);
      
      throw error;
    }
  }

  async compensateSaga(sagaId, failedStepIndex) {
    console.log(`Compensating saga ${sagaId} from step ${failedStepIndex}`);
    
    const saga = await this.db.collection('sagas').findOne({ _id: sagaId });
    
    // Execute compensations in reverse order
    for (let i = failedStepIndex - 1; i >= 0; i--) {
      const step = saga.steps[i];
      
      if (step.compensation) {
        console.log(`Executing compensation for step ${i + 1}: ${step.compensation.name}`);
        
        const session = client.startSession();
        try {
          await session.withTransaction(async () => {
            await this.executeCompensation(step.compensation, session);
            
            await this.db.collection('sagas').updateOne(
              { _id: sagaId },
              {
                $push: {
                  compensationsExecuted: {
                    stepIndex: i,
                    compensationName: step.compensation.name,
                    executedAt: new Date()
                  }
                }
              },
              { session }
            );
          });
        } finally {
          await session.endSession();
        }
      }
    }

    // Mark saga as compensated
    await this.db.collection('sagas').updateOne(
      { _id: sagaId },
      {
        $set: {
          status: 'compensated',
          compensatedAt: new Date()
        }
      }
    );
  }

  async implementOptimisticLocking() {
    // Optimistic locking pattern for concurrent updates
    console.log('Implementing optimistic locking pattern...');
    
    const session = client.startSession();
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        await session.withTransaction(async () => {
          
          // Read document with current version
          const document = await this.db.collection('accounts').findOne(
            { _id: 'account123' },
            { session }
          );
          
          if (!document) {
            throw new Error('Account not found');
          }
          
          // Simulate business logic processing time
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Update with version check
          const updateResult = await this.db.collection('accounts').updateOne(
            { 
              _id: 'account123',
              version: document.version  // Optimistic lock check
            },
            {
              $set: { 
                balance: document.balance - 100,
                lastUpdated: new Date()
              },
              $inc: { version: 1 }  // Increment version
            },
            { session }
          );
          
          if (updateResult.modifiedCount === 0) {
            throw new Error('Optimistic lock conflict - document was modified by another transaction');
          }
          
          console.log('Optimistic lock update successful');
          
        });
        
        break; // Success - exit retry loop
        
      } catch (error) {
        retryCount++;
        
        if (error.message.includes('optimistic lock conflict') && retryCount < maxRetries) {
          console.log(`Optimistic lock conflict, retrying (${retryCount}/${maxRetries})...`);
          
          // Exponential backoff before retry
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
          
        } else {
          console.error('Optimistic locking failed:', error);
          throw error;
        }
      }
    }
    
    await session.endSession();
  }

  async implementDistributedLocking() {
    // Distributed locking for coordinating access across instances
    console.log('Implementing distributed locking pattern...');
    
    const lockId = 'global-lock-' + new ObjectId();
    const lockTimeout = 30000; // 30 seconds
    const acquireTimeout = 5000; // 5 seconds to acquire
    
    const session = client.startSession();
    
    try {
      // Attempt to acquire distributed lock
      const lockAcquired = await this.acquireDistributedLock(
        lockId, lockTimeout, acquireTimeout, session
      );
      
      if (!lockAcquired) {
        throw new Error('Failed to acquire distributed lock');
      }
      
      console.log(`Distributed lock acquired: ${lockId}`);
      
      // Perform critical section operations within transaction
      await session.withTransaction(async () => {
        
        // Critical operations that require distributed coordination
        await this.performCriticalOperations(session);
        
        // Refresh lock if needed for long operations
        await this.refreshDistributedLock(lockId, lockTimeout, session);
        
      });
      
    } finally {
      // Always release the lock
      await this.releaseDistributedLock(lockId, session);
      await session.endSession();
    }
  }

  async acquireDistributedLock(lockId, timeout, acquireTimeout, session) {
    const expiration = new Date(Date.now() + timeout);
    const acquireDeadline = Date.now() + acquireTimeout;
    
    while (Date.now() < acquireDeadline) {
      try {
        const result = await this.db.collection('distributed_locks').insertOne(
          {
            _id: lockId,
            owner: process.env.NODE_ID || 'unknown',
            acquiredAt: new Date(),
            expiresAt: expiration
          },
          { session }
        );
        
        if (result.acknowledged) {
          return true; // Lock acquired
        }
        
      } catch (error) {
        if (error.code === 11000) { // Duplicate key error - lock exists
          
          // Check if lock is expired and can be claimed
          const existingLock = await this.db.collection('distributed_locks').findOne(
            { _id: lockId },
            { session }
          );
          
          if (existingLock && existingLock.expiresAt < new Date()) {
            // Lock is expired, try to claim it
            const claimResult = await this.db.collection('distributed_locks').replaceOne(
              { 
                _id: lockId, 
                expiresAt: existingLock.expiresAt 
              },
              {
                _id: lockId,
                owner: process.env.NODE_ID || 'unknown',
                acquiredAt: new Date(),
                expiresAt: expiration
              },
              { session }
            );
            
            if (claimResult.modifiedCount > 0) {
              return true; // Successfully claimed expired lock
            }
          }
          
          // Lock is held by someone else, wait and retry
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } else {
          throw error;
        }
      }
    }
    
    return false; // Failed to acquire lock within timeout
  }

  async releaseDistributedLock(lockId, session) {
    await this.db.collection('distributed_locks').deleteOne(
      { 
        _id: lockId,
        owner: process.env.NODE_ID || 'unknown'
      },
      { session }
    );
    
    console.log(`Distributed lock released: ${lockId}`);
  }

  async implementTransactionRetryLogic() {
    // Advanced retry logic for transaction conflicts
    console.log('Implementing advanced transaction retry logic...');
    
    const retryConfig = {
      maxRetries: 5,
      initialDelay: 100,
      maxDelay: 2000,
      backoffMultiplier: 2,
      jitterRange: 0.1
    };
    
    let attempt = 0;
    
    while (attempt < retryConfig.maxRetries) {
      const session = client.startSession();
      
      try {
        const result = await session.withTransaction(async () => {
          
          // Simulate transaction work that might conflict
          const account = await this.db.collection('accounts').findOne(
            { _id: 'account123' },
            { session }
          );
          
          if (!account) {
            throw new Error('Account not found');
          }
          
          // Business logic that might conflict with other transactions
          const newBalance = account.balance - 50;
          
          if (newBalance < 0) {
            throw new Error('Insufficient funds');
          }
          
          await this.db.collection('accounts').updateOne(
            { _id: 'account123' },
            { 
              $set: { 
                balance: newBalance,
                lastUpdated: new Date() 
              }
            },
            { session }
          );
          
          return { success: true, newBalance };
          
        }, {
          readConcern: { level: 'majority' },
          writeConcern: { w: 'majority', j: true },
          maxCommitTimeMS: 30000
        });
        
        console.log('Transaction succeeded:', result);
        return result;
        
      } catch (error) {
        attempt++;
        
        // Check if error is retryable
        const isRetryable = this.isTransactionRetryable(error);
        
        if (isRetryable && attempt < retryConfig.maxRetries) {
          // Calculate retry delay with exponential backoff and jitter
          const baseDelay = Math.min(
            retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
            retryConfig.maxDelay
          );
          
          const jitter = baseDelay * retryConfig.jitterRange * (Math.random() - 0.5);
          const delay = baseDelay + jitter;
          
          console.log(`Transaction failed (attempt ${attempt}), retrying in ${delay}ms:`, error.message);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
        } else {
          console.error('Transaction failed after all retries:', error);
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }
  }

  isTransactionRetryable(error) {
    // Determine if transaction error is retryable
    const retryableErrors = [
      'WriteConflict',
      'TransientTransactionError',
      'UnknownTransactionCommitResult',
      'LockTimeout',
      'TemporarilyUnavailable'
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError) ||
      error.code === 112 || // WriteConflict
      error.code === 50 ||  // ExceededTimeLimit
      error.hasErrorLabel('TransientTransactionError') ||
      error.hasErrorLabel('UnknownTransactionCommitResult')
    );
  }

  async performTransactionPerformanceTesting() {
    console.log('Performing transaction performance testing...');
    
    const testConfig = {
      concurrentTransactions: 10,
      transactionsPerThread: 100,
      documentCount: 1000
    };
    
    // Setup test data
    await this.setupPerformanceTestData(testConfig.documentCount);
    
    const startTime = Date.now();
    const promises = [];
    
    // Launch concurrent transaction threads
    for (let i = 0; i < testConfig.concurrentTransactions; i++) {
      const promise = this.runTransactionThread(i, testConfig.transactionsPerThread);
      promises.push(promise);
    }
    
    // Wait for all threads to complete
    const results = await Promise.allSettled(promises);
    const endTime = Date.now();
    
    // Analyze results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const totalTransactions = testConfig.concurrentTransactions * testConfig.transactionsPerThread;
    const throughput = totalTransactions / ((endTime - startTime) / 1000);
    
    console.log('Transaction Performance Results:');
    console.log(`- Total transactions: ${totalTransactions}`);
    console.log(`- Successful threads: ${successful}/${testConfig.concurrentTransactions}`);
    console.log(`- Failed threads: ${failed}`);
    console.log(`- Total time: ${endTime - startTime}ms`);
    console.log(`- Throughput: ${throughput.toFixed(2)} transactions/second`);
    
    return {
      totalTransactions,
      successful,
      failed,
      duration: endTime - startTime,
      throughput
    };
  }

  async runTransactionThread(threadId, transactionCount) {
    console.log(`Starting transaction thread ${threadId} with ${transactionCount} transactions`);
    
    for (let i = 0; i < transactionCount; i++) {
      const session = client.startSession();
      
      try {
        await session.withTransaction(async () => {
          
          // Simulate realistic transaction workload
          const fromAccount = `account_${threadId}_${Math.floor(Math.random() * 10)}`;
          const toAccount = `account_${(threadId + 1) % 10}_${Math.floor(Math.random() * 10)}`;
          const amount = Math.floor(Math.random() * 100) + 1;
          
          // Transfer funds between accounts
          const fromDoc = await this.db.collection('test_accounts').findOne(
            { _id: fromAccount },
            { session }
          );
          
          if (fromDoc && fromDoc.balance >= amount) {
            await this.db.collection('test_accounts').updateOne(
              { _id: fromAccount },
              { $inc: { balance: -amount } },
              { session }
            );
            
            await this.db.collection('test_accounts').updateOne(
              { _id: toAccount },
              { $inc: { balance: amount } },
              { upsert: true, session }
            );
            
            // Create transaction record
            await this.db.collection('test_transactions').insertOne(
              {
                fromAccount,
                toAccount,
                amount,
                timestamp: new Date(),
                threadId,
                transactionIndex: i
              },
              { session }
            );
          }
          
        });
        
      } catch (error) {
        console.error(`Transaction ${i} in thread ${threadId} failed:`, error.message);
      } finally {
        await session.endSession();
      }
    }
    
    console.log(`Thread ${threadId} completed`);
  }

  async setupPerformanceTestData(documentCount) {
    console.log(`Setting up ${documentCount} test accounts...`);
    
    // Clear existing test data
    await this.db.collection('test_accounts').deleteMany({});
    await this.db.collection('test_transactions').deleteMany({});
    
    // Create test accounts
    const accounts = [];
    for (let i = 0; i < documentCount; i++) {
      accounts.push({
        _id: `account_${Math.floor(i / 100)}_${i % 100}`,
        balance: Math.floor(Math.random() * 1000) + 100,
        createdAt: new Date()
      });
    }
    
    await this.db.collection('test_accounts').insertMany(accounts);
    
    console.log('Test data setup completed');
  }
}
```

## SQL-Style Transaction Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB transaction management:

```sql
-- QueryLeaf transaction operations with SQL-familiar syntax

-- Begin transaction with isolation level
BEGIN TRANSACTION 
WITH (
  isolation_level = 'read_committed',
  read_concern = 'majority',
  write_concern = 'majority',
  max_timeout = '30s'
);

-- Complex multi-collection transaction
WITH order_validation AS (
  -- Validate inventory availability
  SELECT 
    product_id,
    available_quantity,
    reserved_quantity,
    CASE 
      WHEN available_quantity >= 5 THEN true 
      ELSE false 
    END as inventory_available
  FROM inventory 
  WHERE product_id = 'prod_12345'
),
payment_validation AS (
  -- Validate user payment capability
  SELECT 
    user_id,
    account_balance,
    credit_limit,
    account_status,
    CASE 
      WHEN account_status = 'active' AND (account_balance + credit_limit) >= 299.99 THEN true
      ELSE false
    END as payment_valid
  FROM users 
  WHERE user_id = 'user_67890'
),
promotion_calculation AS (
  -- Calculate applicable promotions
  SELECT 
    promotion_id,
    discount_type,
    discount_value,
    CASE discount_type
      WHEN 'percentage' THEN 299.99 * (discount_value / 100.0)
      WHEN 'fixed' THEN LEAST(discount_value, 299.99)
      ELSE 0
    END as discount_amount
  FROM promotions 
  WHERE active = true 
    AND start_date <= CURRENT_TIMESTAMP 
    AND end_date >= CURRENT_TIMESTAMP
    AND (global_promotion = true OR 'user_67890' = ANY(applicable_users))
  ORDER BY discount_amount DESC
  LIMIT 1
)

-- Create order within transaction
INSERT INTO orders (
  order_id,
  user_id,
  order_number,
  status,
  
  -- Order items as nested documents
  items,
  
  -- Pricing breakdown
  pricing,
  
  -- Customer information  
  customer,
  
  -- Shipping details
  shipping,
  
  -- Lifecycle tracking
  lifecycle,
  
  created_at
)
SELECT 
  gen_random_uuid() as order_id,
  'user_67890' as user_id,
  'ORD-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || SUBSTRING(MD5(RANDOM()::text), 1, 9) as order_number,
  'confirmed' as status,
  
  -- Items array with product details
  JSON_BUILD_ARRAY(
    JSON_BUILD_OBJECT(
      'product_id', 'prod_12345',
      'product_name', 'Premium Widget',
      'quantity', 5,
      'unit_price', 59.99,
      'line_total', 299.95,
      'product_snapshot', JSON_BUILD_OBJECT(
        'name', 'Premium Widget',
        'category', 'electronics',
        'sku', 'WID-12345'
      )
    )
  ) as items,
  
  -- Pricing structure
  JSON_BUILD_OBJECT(
    'subtotal', 299.99,
    'discount_amount', COALESCE(pc.discount_amount, 0),
    'tax_amount', (299.99 - COALESCE(pc.discount_amount, 0)) * 0.08,
    'shipping_cost', 15.99,
    'final_amount', (299.99 - COALESCE(pc.discount_amount, 0)) * 1.08 + 15.99
  ) as pricing,
  
  -- Customer data
  JSON_BUILD_OBJECT(
    'user_id', 'user_67890',
    'email', 'customer@example.com',
    'loyalty_tier', 'gold'
  ) as customer,
  
  -- Shipping information
  JSON_BUILD_OBJECT(
    'address', JSON_BUILD_OBJECT(
      'street', '123 Main St',
      'city', 'Anytown',
      'state', 'CA',
      'zip', '12345'
    ),
    'method', 'standard',
    'estimated_delivery', CURRENT_TIMESTAMP + INTERVAL '5 days',
    'cost', 15.99
  ) as shipping,
  
  -- Lifecycle tracking
  JSON_BUILD_OBJECT(
    'created_at', CURRENT_TIMESTAMP,
    'confirmed_at', CURRENT_TIMESTAMP,
    'status', 'confirmed',
    'estimated_fulfillment', CURRENT_TIMESTAMP + INTERVAL '1 day'
  ) as lifecycle,
  
  CURRENT_TIMESTAMP as created_at

FROM order_validation ov
CROSS JOIN payment_validation pv  
LEFT JOIN promotion_calculation pc ON true
WHERE ov.inventory_available = true 
  AND pv.payment_valid = true;

-- Update inventory within same transaction
UPDATE inventory 
SET 
  reserved_quantity = reserved_quantity + 5,
  reservation_history = ARRAY_APPEND(
    reservation_history,
    JSON_BUILD_OBJECT(
      'reservation_id', gen_random_uuid(),
      'quantity', 5,
      'timestamp', CURRENT_TIMESTAMP,
      'type', 'order_reservation'
    )
  ),
  last_updated = CURRENT_TIMESTAMP
WHERE product_id = 'prod_12345' 
  AND (quantity - reserved_quantity) >= 5;

-- Process payment within transaction
INSERT INTO payments (
  payment_id,
  order_id,
  user_id,
  amount,
  currency,
  payment_method,
  status,
  transaction_details,
  gateway,
  created_at
)
SELECT 
  gen_random_uuid() as payment_id,
  o.order_id,
  o.user_id,
  (o.pricing->>'final_amount')::numeric as amount,
  'USD' as currency,
  
  -- Payment method details
  JSON_BUILD_OBJECT(
    'type', 'card',
    'masked_number', '****1234',
    'provider', 'visa'
  ) as payment_method,
  
  'completed' as status,
  
  -- Transaction details
  JSON_BUILD_OBJECT(
    'authorization_code', 'AUTH_' || EXTRACT(EPOCH FROM NOW())::bigint,
    'transaction_id', 'TXN_' || SUBSTRING(MD5(RANDOM()::text), 1, 16),
    'processed_at', CURRENT_TIMESTAMP,
    'processing_fee', (o.pricing->>'final_amount')::numeric * 0.029,
    'risk_score', RANDOM() * 0.3,
    'fraud_checks', JSON_BUILD_OBJECT(
      'address_verification', 'pass',
      'cvv_verification', 'pass', 
      'velocity_check', 'pass'
    )
  ) as transaction_details,
  
  -- Gateway information
  JSON_BUILD_OBJECT(
    'provider', 'stripe',
    'gateway_transaction_id', 'pi_' || SUBSTRING(MD5(RANDOM()::text), 1, 24),
    'gateway_fee', (o.pricing->>'final_amount')::numeric * 0.029 + 0.30
  ) as gateway,
  
  CURRENT_TIMESTAMP as created_at

FROM orders o 
WHERE o.user_id = 'user_67890' 
  AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute';

-- Update user loyalty program
UPDATE loyalty_program 
SET 
  total_points = total_points + FLOOR((SELECT pricing->>'final_amount' FROM orders WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute')::numeric),
  lifetime_points = lifetime_points + FLOOR((SELECT pricing->>'final_amount' FROM orders WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute')::numeric),
  total_spend = total_spend + (SELECT pricing->>'final_amount' FROM orders WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute')::numeric,
  
  points_history = ARRAY_APPEND(
    points_history,
    JSON_BUILD_OBJECT(
      'type', 'earned',
      'points', FLOOR((SELECT pricing->>'final_amount' FROM orders WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute')::numeric),
      'description', 'Order purchase',
      'timestamp', CURRENT_TIMESTAMP
    )
  ),
  
  last_updated = CURRENT_TIMESTAMP
WHERE user_id = 'user_67890';

-- Create comprehensive audit trail
INSERT INTO audit_log (
  audit_id,
  transaction_id,
  transaction_type,
  entities_affected,
  changes_made,
  user_id,
  amount,
  compliance,
  timestamp
)
SELECT 
  gen_random_uuid() as audit_id,
  txid_current() as transaction_id,
  'order_creation' as transaction_type,
  
  -- Entities affected by transaction
  JSON_BUILD_OBJECT(
    'order_id', o.order_id,
    'payment_id', p.payment_id,
    'user_id', o.user_id,
    'product_ids', JSON_BUILD_ARRAY('prod_12345')
  ) as entities_affected,
  
  -- Detailed changes made
  JSON_BUILD_OBJECT(
    'order_created', JSON_BUILD_OBJECT(
      'order_id', o.order_id,
      'status', 'confirmed',
      'amount', (o.pricing->>'final_amount')::numeric
    ),
    'inventory_reserved', JSON_BUILD_OBJECT(
      'product_id', 'prod_12345',
      'quantity_reserved', 5
    ),
    'payment_processed', JSON_BUILD_OBJECT(
      'payment_id', p.payment_id,
      'amount', p.amount,
      'status', 'completed'
    ),
    'loyalty_updated', JSON_BUILD_OBJECT(
      'points_earned', FLOOR(p.amount),
      'total_spend_increase', p.amount
    )
  ) as changes_made,
  
  o.user_id,
  (o.pricing->>'final_amount')::numeric as amount,
  
  -- Compliance information
  JSON_BUILD_OBJECT(
    'retention_period', 2557, -- 7 years in days
    'encryption_required', true,
    'audit_level', 'full'
  ) as compliance,
  
  CURRENT_TIMESTAMP as timestamp

FROM orders o
JOIN payments p ON o.order_id = p.order_id
WHERE o.user_id = 'user_67890' 
  AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute';

-- Transaction validation before commit
SELECT 
  -- Verify order creation
  (SELECT COUNT(*) FROM orders WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute') as orders_created,
  
  -- Verify payment processing
  (SELECT COUNT(*) FROM payments WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute') as payments_processed,
  
  -- Verify inventory reservation
  (SELECT reserved_quantity FROM inventory WHERE product_id = 'prod_12345') as inventory_reserved,
  
  -- Verify loyalty update
  (SELECT total_points FROM loyalty_program WHERE user_id = 'user_67890') as loyalty_points,
  
  -- Overall validation
  CASE 
    WHEN (SELECT COUNT(*) FROM orders WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute') = 1
     AND (SELECT COUNT(*) FROM payments WHERE user_id = 'user_67890' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute') = 1
     AND (SELECT reserved_quantity FROM inventory WHERE product_id = 'prod_12345') >= 5
    THEN 'TRANSACTION_VALID'
    ELSE 'TRANSACTION_INVALID'
  END as validation_result;

-- Conditional commit based on validation
COMMIT TRANSACTION
WHERE validation_result = 'TRANSACTION_VALID';

-- Automatic rollback if validation fails
-- ROLLBACK TRANSACTION IF validation_result = 'TRANSACTION_INVALID';

-- Advanced transaction patterns with QueryLeaf

-- Nested transaction with savepoints
BEGIN TRANSACTION;

  -- Create savepoint for partial rollback
  SAVEPOINT order_creation;
  
  -- Create initial order
  INSERT INTO orders (order_id, user_id, status, created_at)
  VALUES (gen_random_uuid(), 'user_123', 'pending', CURRENT_TIMESTAMP);
  
  -- Create savepoint before inventory updates
  SAVEPOINT inventory_updates;
  
  -- Update inventory (might fail)
  UPDATE inventory 
  SET reserved_quantity = reserved_quantity + 10
  WHERE product_id = 'prod_456' AND quantity >= reserved_quantity + 10;
  
  -- Check if inventory update succeeded
  SELECT 
    CASE 
      WHEN ROW_COUNT() = 0 THEN 'INSUFFICIENT_INVENTORY'
      ELSE 'INVENTORY_UPDATED'
    END as inventory_status;
  
  -- Conditional rollback to savepoint
  ROLLBACK TO SAVEPOINT inventory_updates 
  WHERE inventory_status = 'INSUFFICIENT_INVENTORY';
  
  -- Alternative inventory handling
  UPDATE orders 
  SET status = 'backordered',
      backorder_reason = 'Insufficient inventory'
  WHERE order_id IN (
    SELECT order_id FROM orders 
    WHERE user_id = 'user_123' 
      AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute'
  )
  AND inventory_status = 'INSUFFICIENT_INVENTORY';

COMMIT TRANSACTION;

-- Distributed transaction across collections
BEGIN DISTRIBUTED_TRANSACTION 
WITH (
  collections = ['orders', 'inventory', 'payments', 'audit_log'],
  coordinator = 'two_phase_commit',
  timeout = '60s'
);

  -- Phase 1: Prepare all operations
  PREPARE TRANSACTION 'order_tx_001' ON orders, inventory, payments, audit_log;
  
  -- Phase 2: Commit if all participants are ready
  COMMIT PREPARED 'order_tx_001';

-- Transaction with retry logic
BEGIN TRANSACTION 
WITH (
  retry_attempts = 3,
  retry_delay = '100ms',
  exponential_backoff = true,
  max_delay = '2s'
);

  -- Operations that might conflict with concurrent transactions
  UPDATE accounts 
  SET balance = balance - 100,
      version = version + 1,
      last_updated = CURRENT_TIMESTAMP
  WHERE account_id = 'acc_789' 
    AND balance >= 100
    AND version = (
      SELECT version FROM accounts WHERE account_id = 'acc_789'
    ); -- Optimistic locking

COMMIT TRANSACTION 
WITH (
  on_conflict = 'retry',
  conflict_resolution = 'last_writer_wins'
);

-- Real-time transaction monitoring
WITH transaction_metrics AS (
  SELECT 
    DATE_TRUNC('minute', created_at) as time_bucket,
    COUNT(*) as total_transactions,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_transactions,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_transactions,
    COUNT(*) FILTER (WHERE status = 'rolled_back') as rolled_back_transactions,
    
    -- Performance metrics
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))) as p95_duration,
    MAX(EXTRACT(EPOCH FROM (completed_at - created_at))) as max_duration,
    
    -- Error analysis
    array_agg(DISTINCT error_code) FILTER (WHERE status = 'failed') as error_codes,
    array_agg(DISTINCT error_message) FILTER (WHERE status = 'failed') as error_messages,
    
    -- Lock analysis
    AVG(lock_wait_time_ms) as avg_lock_wait_time,
    COUNT(*) FILTER (WHERE lock_timeout = true) as lock_timeouts,
    
    -- Resource usage
    AVG(documents_read) as avg_docs_read,
    AVG(documents_written) as avg_docs_written,
    SUM(bytes_transferred) / (1024 * 1024) as total_mb_transferred

  FROM transaction_log
  WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  GROUP BY DATE_TRUNC('minute', created_at)
),

transaction_health AS (
  SELECT 
    time_bucket,
    total_transactions,
    successful_transactions,
    failed_transactions,
    rolled_back_transactions,
    
    -- Success rate
    ROUND((successful_transactions::numeric / NULLIF(total_transactions, 0)) * 100, 1) as success_rate_percent,
    
    -- Performance assessment
    ROUND(avg_duration_seconds, 3) as avg_duration_sec,
    ROUND(p95_duration, 3) as p95_duration_sec,
    ROUND(max_duration, 3) as max_duration_sec,
    
    -- Performance status
    CASE 
      WHEN avg_duration_seconds > 30 THEN 'SLOW'
      WHEN avg_duration_seconds > 10 THEN 'DEGRADED'
      WHEN p95_duration > 60 THEN 'INCONSISTENT'
      ELSE 'NORMAL'
    END as performance_status,
    
    -- Error analysis
    CASE 
      WHEN (failed_transactions + rolled_back_transactions)::numeric / NULLIF(total_transactions, 0) > 0.1 THEN 'HIGH_ERROR_RATE'
      WHEN (failed_transactions + rolled_back_transactions)::numeric / NULLIF(total_transactions, 0) > 0.05 THEN 'ELEVATED_ERRORS'
      ELSE 'NORMAL_ERROR_RATE'
    END as error_status,
    
    error_codes,
    error_messages,
    
    -- Lock performance
    ROUND(avg_lock_wait_time, 1) as avg_lock_wait_ms,
    lock_timeouts,
    
    -- Resource efficiency
    ROUND(avg_docs_read, 1) as avg_docs_read,
    ROUND(avg_docs_written, 1) as avg_docs_written,
    ROUND(total_mb_transferred, 2) as mb_transferred
    
  FROM transaction_metrics
)

SELECT 
  time_bucket,
  total_transactions,
  success_rate_percent,
  performance_status,
  error_status,
  avg_duration_sec,
  p95_duration_sec,
  
  -- Alerts and recommendations
  CASE 
    WHEN performance_status = 'SLOW' THEN 'Transaction performance is degraded - investigate slow operations'
    WHEN performance_status = 'INCONSISTENT' THEN 'Inconsistent transaction performance - check for lock contention'
    WHEN error_status = 'HIGH_ERROR_RATE' THEN 'High transaction error rate - review application logic and retry mechanisms'
    WHEN lock_timeouts > total_transactions * 0.1 THEN 'Frequent lock timeouts - consider optimistic locking or shorter transactions'
    ELSE 'Transaction performance within normal parameters'
  END as recommendation,
  
  -- Detailed metrics for investigation
  error_codes,
  avg_lock_wait_ms,
  lock_timeouts,
  mb_transferred

FROM transaction_health
WHERE performance_status != 'NORMAL' OR error_status != 'NORMAL_ERROR_RATE'
ORDER BY time_bucket DESC;

-- Transaction isolation level testing
SELECT 
  isolation_level,
  transaction_id,
  operation_type,
  collection_name,
  
  -- Read phenomena detection
  CASE 
    WHEN EXISTS(
      SELECT 1 FROM transaction_operations o2 
      WHERE o2.transaction_id != t.transaction_id 
        AND o2.document_id = t.document_id
        AND o2.timestamp BETWEEN t.start_timestamp AND t.end_timestamp
        AND o2.operation_type = 'UPDATE'
    ) THEN 'DIRTY_READ_POSSIBLE'
    
    WHEN EXISTS(
      SELECT 1 FROM transaction_operations o2
      WHERE o2.transaction_id = t.transaction_id
        AND o2.document_id = t.document_id  
        AND o2.operation_type = 'READ'
        AND o2.timestamp < t.timestamp
        AND o2.value != t.value
    ) THEN 'NON_REPEATABLE_READ'
    
    ELSE 'CONSISTENT_READ'
  END as read_consistency_status,
  
  -- Lock analysis
  lock_type,
  lock_duration_ms,
  lock_conflicts,
  
  -- Performance impact
  operation_duration_ms,
  documents_affected,
  
  -- Concurrency metrics
  concurrent_transactions,
  wait_time_ms

FROM transaction_operations t
WHERE operation_timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
ORDER BY transaction_id, operation_timestamp;

-- QueryLeaf provides comprehensive transaction capabilities:
-- 1. SQL-familiar transaction syntax with BEGIN/COMMIT/ROLLBACK
-- 2. Advanced isolation level control and read/write concern specification
-- 3. Nested transactions with savepoint support for partial rollback
-- 4. Distributed transaction coordination across multiple collections
-- 5. Automatic retry logic with exponential backoff for conflict resolution
-- 6. Real-time transaction performance monitoring and health assessment
-- 7. Optimistic locking patterns with version-based conflict detection
-- 8. Complex multi-collection operations with full ACID guarantees
-- 9. Integration with MongoDB's native transaction optimizations
-- 10. Familiar SQL patterns for complex business logic within transactions
```

## Best Practices for MongoDB Transaction Implementation

### Transaction Design Guidelines

Essential principles for optimal MongoDB transaction design:

1. **Transaction Scope**: Keep transactions as small and focused as possible to minimize lock contention
2. **Read/Write Patterns**: Design transactions to minimize conflicts through strategic ordering of operations
3. **Retry Logic**: Implement robust retry mechanisms for transient transaction failures
4. **Timeout Configuration**: Set appropriate timeouts based on expected transaction duration
5. **Isolation Levels**: Choose appropriate isolation levels based on consistency requirements
6. **Error Handling**: Design comprehensive error handling with meaningful business-level responses

### Performance and Scalability

Optimize MongoDB transactions for production workloads:

1. **Lock Minimization**: Structure operations to minimize lock duration and scope
2. **Index Strategy**: Ensure proper indexing to support transaction query patterns
3. **Connection Management**: Use appropriate connection pooling for transaction workloads
4. **Monitoring Setup**: Implement comprehensive transaction performance monitoring
5. **Resource Planning**: Plan memory and CPU resources for transaction processing overhead
6. **Testing Strategy**: Implement thorough testing for concurrent transaction scenarios

## Conclusion

MongoDB Multi-Document Transactions provide comprehensive ACID compliance that eliminates the complexity and limitations of traditional distributed consistency approaches while maintaining the flexibility and scalability of MongoDB's document model. The ability to perform complex multi-collection operations with guaranteed consistency makes building reliable distributed systems both powerful and straightforward.

Key MongoDB Transaction benefits include:

- **Full ACID Compliance**: Complete atomicity, consistency, isolation, and durability across multiple documents
- **Flexible Document Operations**: Support for complex document structures and relationships within transactions  
- **Distributed Consistency**: Seamless operation across replica sets and sharded clusters
- **Automatic Rollback**: Comprehensive rollback capabilities on failure with consistent state restoration
- **Performance Optimization**: Intelligent locking and concurrency control for optimal throughput
- **Familiar Patterns**: SQL-style transaction semantics with commit/rollback operations

Whether you're building e-commerce platforms, financial systems, inventory management applications, or any system requiring strong consistency guarantees, MongoDB Transactions with QueryLeaf's familiar SQL interface provides the foundation for reliable distributed applications. This combination enables sophisticated transaction processing while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB transaction operations while providing SQL-familiar transaction control, isolation level management, and consistency guarantees. Advanced transaction patterns, retry logic, and performance monitoring are seamlessly handled through familiar SQL syntax, making robust distributed systems both powerful and accessible to SQL-oriented development teams.

The integration of native ACID transaction capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both strong consistency and familiar database interaction patterns, ensuring your distributed systems remain both reliable and maintainable as they scale and evolve.