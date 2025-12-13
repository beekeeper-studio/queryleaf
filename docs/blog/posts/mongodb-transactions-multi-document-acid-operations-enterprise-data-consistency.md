---
title: "MongoDB Transactions and Multi-Document ACID Operations: Enterprise Data Consistency and Integrity for Mission-Critical Applications"
description: "Master MongoDB transactions for multi-document ACID operations across distributed systems. Learn advanced transaction patterns, consistency strategies, error handling, and SQL-familiar transaction management for enterprise applications requiring strong data integrity."
date: 2025-12-12
tags: [mongodb, transactions, acid, consistency, enterprise, distributed-systems, sql, data-integrity]
---

# MongoDB Transactions and Multi-Document ACID Operations: Enterprise Data Consistency and Integrity for Mission-Critical Applications

Modern enterprise applications require strong data consistency guarantees across complex business operations that span multiple documents, collections, and even databases. Traditional relational databases provide ACID properties through table-level transactions, but often struggle with distributed architectures and horizontal scaling requirements needed for high-volume enterprise workloads.

MongoDB's multi-document transactions provide full ACID guarantees across multiple documents and collections within replica sets and sharded clusters, enabling complex business operations to maintain data integrity while supporting distributed system architectures. Unlike traditional databases limited to single-server ACID properties, MongoDB transactions scale horizontally while maintaining consistency guarantees essential for financial, healthcare, and other mission-critical applications.

## The Traditional Distributed Transaction Challenge

Conventional database transaction management faces significant limitations in distributed environments:

```sql
-- Traditional PostgreSQL distributed transactions - complex coordination with performance overhead

-- Financial transfer operation requiring distributed consistency across accounts
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_type VARCHAR(20) NOT NULL DEFAULT 'checking',
    balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Account metadata
    account_status VARCHAR(20) DEFAULT 'active',
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Balance constraints and limits
    minimum_balance DECIMAL(15,2) DEFAULT 0.00,
    overdraft_limit DECIMAL(15,2) DEFAULT 0.00,
    daily_transfer_limit DECIMAL(15,2) DEFAULT 10000.00,
    
    -- Compliance and tracking
    kyc_verified BOOLEAN DEFAULT FALSE,
    risk_level VARCHAR(20) DEFAULT 'low',
    regulatory_flags TEXT[],
    
    -- Audit trail
    created_by INTEGER,
    updated_by INTEGER,
    version_number INTEGER DEFAULT 1,
    
    CONSTRAINT valid_balance CHECK (balance + overdraft_limit >= 0),
    CONSTRAINT valid_status CHECK (account_status IN ('active', 'suspended', 'closed', 'frozen'))
);

-- Transaction log for audit and reconciliation requirements
CREATE TABLE transaction_log (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    transaction_type VARCHAR(50) NOT NULL,
    
    -- Source and destination account information
    source_account_id UUID REFERENCES accounts(account_id),
    destination_account_id UUID REFERENCES accounts(account_id),
    
    -- Transaction amounts and currency
    transaction_amount DECIMAL(15,2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    exchange_rate DECIMAL(10,6),
    
    -- Transaction details
    description TEXT,
    reference_number VARCHAR(100) UNIQUE,
    external_reference VARCHAR(100),
    merchant_info JSONB,
    
    -- Processing status and workflow
    transaction_status VARCHAR(20) DEFAULT 'pending',
    processing_stage VARCHAR(30) DEFAULT 'initiated',
    approval_required BOOLEAN DEFAULT FALSE,
    approved_by INTEGER,
    approved_at TIMESTAMP,
    
    -- Error handling and retry logic
    error_code VARCHAR(20),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Compliance and regulatory
    compliance_checked BOOLEAN DEFAULT FALSE,
    aml_flagged BOOLEAN DEFAULT FALSE,
    regulatory_reporting JSONB,
    
    -- Audit and tracking
    created_by INTEGER,
    session_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    
    CONSTRAINT valid_transaction_type CHECK (transaction_type IN (
        'transfer', 'deposit', 'withdrawal', 'payment', 'refund', 'fee', 'interest'
    )),
    CONSTRAINT valid_amount CHECK (transaction_amount > 0),
    CONSTRAINT valid_status CHECK (transaction_status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'
    ))
);

-- Account balance history for audit and reconciliation
CREATE TABLE balance_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    transaction_id UUID REFERENCES transaction_log(transaction_id),
    
    -- Balance tracking
    previous_balance DECIMAL(15,2) NOT NULL,
    transaction_amount DECIMAL(15,2) NOT NULL,
    new_balance DECIMAL(15,2) NOT NULL,
    running_balance DECIMAL(15,2) NOT NULL,
    
    -- Timestamp and sequencing
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sequence_number BIGSERIAL,
    
    -- Balance verification
    balance_verified BOOLEAN DEFAULT FALSE,
    verification_timestamp TIMESTAMP,
    discrepancy_amount DECIMAL(15,2) DEFAULT 0.00,
    
    -- Reconciliation metadata
    reconciliation_batch_id UUID,
    reconciliation_status VARCHAR(20) DEFAULT 'pending',
    
    CONSTRAINT balance_consistency CHECK (previous_balance + transaction_amount = new_balance)
);

-- Complex distributed transaction procedure with error handling and rollback complexity
CREATE OR REPLACE FUNCTION transfer_funds_with_distributed_consistency(
    p_source_account_id UUID,
    p_destination_account_id UUID,
    p_amount DECIMAL(15,2),
    p_description TEXT DEFAULT 'Fund Transfer',
    p_reference_number VARCHAR(100) DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    transaction_id UUID,
    transaction_status TEXT,
    source_new_balance DECIMAL(15,2),
    destination_new_balance DECIMAL(15,2),
    processing_result TEXT
) AS $$
DECLARE
    v_transaction_id UUID := gen_random_uuid();
    v_source_account RECORD;
    v_destination_account RECORD;
    v_source_new_balance DECIMAL(15,2);
    v_destination_new_balance DECIMAL(15,2);
    v_daily_transfer_total DECIMAL(15,2);
    v_reference_number VARCHAR(100);
    v_compliance_result JSONB;
    v_error_message TEXT;
    
BEGIN
    -- Generate reference number if not provided
    v_reference_number := COALESCE(p_reference_number, 'TXN' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint || random()::text);
    
    -- Start distributed transaction with SERIALIZABLE isolation for consistency
    BEGIN
        -- Lock source account and validate
        SELECT * INTO v_source_account
        FROM accounts 
        WHERE account_id = p_source_account_id 
        AND account_status = 'active'
        FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Source account not found or inactive: %', p_source_account_id;
        END IF;
        
        -- Lock destination account and validate
        SELECT * INTO v_destination_account
        FROM accounts 
        WHERE account_id = p_destination_account_id 
        AND account_status IN ('active', 'suspended') -- Allow deposits to suspended accounts
        FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Destination account not found or closed: %', p_destination_account_id;
        END IF;
        
        -- Validate transfer amount constraints
        IF p_amount <= 0 THEN
            RAISE EXCEPTION 'Transfer amount must be positive: %', p_amount;
        END IF;
        
        -- Check sufficient balance including overdraft
        v_source_new_balance := v_source_account.balance - p_amount;
        IF v_source_new_balance < -v_source_account.overdraft_limit THEN
            RAISE EXCEPTION 'Insufficient funds: balance=%, overdraft=%, requested=%', 
                v_source_account.balance, v_source_account.overdraft_limit, p_amount;
        END IF;
        
        -- Check daily transfer limits
        SELECT COALESCE(SUM(transaction_amount), 0) INTO v_daily_transfer_total
        FROM transaction_log
        WHERE source_account_id = p_source_account_id
        AND transaction_timestamp >= CURRENT_DATE
        AND transaction_status IN ('completed', 'processing')
        AND transaction_type = 'transfer';
        
        IF v_daily_transfer_total + p_amount > v_source_account.daily_transfer_limit THEN
            RAISE EXCEPTION 'Daily transfer limit exceeded: current=%, limit=%, requested=%',
                v_daily_transfer_total, v_source_account.daily_transfer_limit, p_amount;
        END IF;
        
        -- Compliance and AML checks (simplified)
        v_compliance_result := jsonb_build_object(
            'amount_threshold_check', p_amount > 10000,
            'cross_border_check', v_source_account.currency_code != v_destination_account.currency_code,
            'high_risk_account', v_source_account.risk_level = 'high' OR v_destination_account.risk_level = 'high',
            'kyc_verified', v_source_account.kyc_verified AND v_destination_account.kyc_verified
        );
        
        IF (v_compliance_result->>'amount_threshold_check')::boolean AND NOT (v_compliance_result->>'kyc_verified')::boolean THEN
            RAISE EXCEPTION 'Large transfer requires full KYC verification for both accounts';
        END IF;
        
        -- Create transaction log entry
        INSERT INTO transaction_log (
            transaction_id, source_account_id, destination_account_id,
            transaction_amount, currency_code, description, reference_number,
            transaction_type, transaction_status, processing_stage,
            compliance_checked, regulatory_reporting, created_by, session_id
        ) VALUES (
            v_transaction_id, p_source_account_id, p_destination_account_id,
            p_amount, v_source_account.currency_code, p_description, v_reference_number,
            'transfer', 'processing', 'balance_update',
            true, v_compliance_result, p_user_id, current_setting('application.session_id', true)
        );
        
        -- Update source account balance
        UPDATE accounts 
        SET balance = balance - p_amount,
            last_activity = CURRENT_TIMESTAMP,
            updated_by = p_user_id,
            version_number = version_number + 1
        WHERE account_id = p_source_account_id;
        
        -- Record source balance history
        INSERT INTO balance_history (
            account_id, transaction_id, previous_balance, 
            transaction_amount, new_balance, running_balance
        ) VALUES (
            p_source_account_id, v_transaction_id, v_source_account.balance,
            -p_amount, v_source_new_balance, v_source_new_balance
        );
        
        -- Calculate destination new balance
        v_destination_new_balance := v_destination_account.balance + p_amount;
        
        -- Update destination account balance
        UPDATE accounts 
        SET balance = balance + p_amount,
            last_activity = CURRENT_TIMESTAMP,
            updated_by = p_user_id,
            version_number = version_number + 1
        WHERE account_id = p_destination_account_id;
        
        -- Record destination balance history
        INSERT INTO balance_history (
            account_id, transaction_id, previous_balance, 
            transaction_amount, new_balance, running_balance
        ) VALUES (
            p_destination_account_id, v_transaction_id, v_destination_account.balance,
            p_amount, v_destination_new_balance, v_destination_new_balance
        );
        
        -- Update transaction status to completed
        UPDATE transaction_log 
        SET transaction_status = 'completed',
            processing_stage = 'completed',
            approved_at = CURRENT_TIMESTAMP
        WHERE transaction_id = v_transaction_id;
        
        -- Commit the distributed transaction
        COMMIT;
        
        -- Return success results
        RETURN QUERY SELECT 
            v_transaction_id,
            'completed'::text,
            v_source_new_balance,
            v_destination_new_balance,
            'Transfer completed successfully'::text;
        
    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback transaction and log error
            ROLLBACK;
            
            v_error_message := SQLERRM;
            
            -- Insert failed transaction record for audit
            INSERT INTO transaction_log (
                transaction_id, source_account_id, destination_account_id,
                transaction_amount, currency_code, description, reference_number,
                transaction_type, transaction_status, processing_stage,
                error_code, error_message, created_by
            ) VALUES (
                v_transaction_id, p_source_account_id, p_destination_account_id,
                p_amount, COALESCE(v_source_account.currency_code, 'USD'), p_description, v_reference_number,
                'transfer', 'failed', 'error_handling',
                'TRANSFER_FAILED', v_error_message, p_user_id
            );
            
            -- Return error results
            RETURN QUERY SELECT 
                v_transaction_id,
                'failed'::text,
                COALESCE(v_source_account.balance, 0::decimal),
                COALESCE(v_destination_account.balance, 0::decimal),
                ('Transfer failed: ' || v_error_message)::text;
    END;
END;
$$ LANGUAGE plpgsql;

-- Complex batch transaction processing with distributed coordination
CREATE OR REPLACE FUNCTION process_batch_transfers(
    p_transfers JSONB, -- Array of transfer specifications
    p_batch_id UUID DEFAULT gen_random_uuid(),
    p_processing_user INTEGER DEFAULT NULL
)
RETURNS TABLE (
    batch_id UUID,
    total_transfers INTEGER,
    successful_transfers INTEGER,
    failed_transfers INTEGER,
    total_amount DECIMAL(15,2),
    processing_duration INTERVAL,
    batch_status TEXT
) AS $$
DECLARE
    v_transfer JSONB;
    v_transfer_result RECORD;
    v_batch_start TIMESTAMP := CURRENT_TIMESTAMP;
    v_total_transfers INTEGER := 0;
    v_successful_transfers INTEGER := 0;
    v_failed_transfers INTEGER := 0;
    v_total_amount DECIMAL(15,2) := 0;
    v_individual_amount DECIMAL(15,2);
    
BEGIN
    -- Create batch processing record
    INSERT INTO batch_processing_log (
        batch_id, batch_type, initiated_by, initiated_at, 
        total_operations, batch_status
    ) VALUES (
        p_batch_id, 'fund_transfers', p_processing_user, v_batch_start,
        jsonb_array_length(p_transfers), 'processing'
    );
    
    -- Process each transfer in the batch
    FOR v_transfer IN SELECT * FROM jsonb_array_elements(p_transfers) LOOP
        BEGIN
            v_individual_amount := (v_transfer->>'amount')::DECIMAL(15,2);
            v_total_amount := v_total_amount + v_individual_amount;
            v_total_transfers := v_total_transfers + 1;
            
            -- Execute individual transfer
            SELECT * INTO v_transfer_result
            FROM transfer_funds_with_distributed_consistency(
                (v_transfer->>'source_account_id')::UUID,
                (v_transfer->>'destination_account_id')::UUID,
                v_individual_amount,
                COALESCE(v_transfer->>'description', 'Batch Transfer'),
                v_transfer->>'reference_number',
                p_processing_user
            );
            
            IF v_transfer_result.transaction_status = 'completed' THEN
                v_successful_transfers := v_successful_transfers + 1;
            ELSE
                v_failed_transfers := v_failed_transfers + 1;
                
                -- Log batch transfer failure
                INSERT INTO batch_operation_details (
                    batch_id, operation_sequence, operation_status,
                    operation_data, error_message
                ) VALUES (
                    p_batch_id, v_total_transfers, 'failed',
                    v_transfer, v_transfer_result.processing_result
                );
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                v_failed_transfers := v_failed_transfers + 1;
                
                -- Log exception details
                INSERT INTO batch_operation_details (
                    batch_id, operation_sequence, operation_status,
                    operation_data, error_message
                ) VALUES (
                    p_batch_id, v_total_transfers, 'error',
                    v_transfer, SQLERRM
                );
        END;
    END LOOP;
    
    -- Update batch completion status
    UPDATE batch_processing_log 
    SET batch_status = CASE 
            WHEN v_failed_transfers = 0 THEN 'completed_success'
            WHEN v_successful_transfers = 0 THEN 'completed_failure'
            ELSE 'completed_partial'
        END,
        completed_at = CURRENT_TIMESTAMP,
        successful_operations = v_successful_transfers,
        failed_operations = v_failed_transfers,
        total_amount_processed = v_total_amount
    WHERE batch_id = p_batch_id;
    
    -- Return batch processing summary
    RETURN QUERY SELECT 
        p_batch_id,
        v_total_transfers,
        v_successful_transfers,
        v_failed_transfers,
        v_total_amount,
        CURRENT_TIMESTAMP - v_batch_start,
        CASE 
            WHEN v_failed_transfers = 0 THEN 'success'
            WHEN v_successful_transfers = 0 THEN 'failed'
            ELSE 'partial_success'
        END::text;
END;
$$ LANGUAGE plpgsql;

-- Problems with traditional distributed transaction management:
-- 1. Complex distributed coordination requiring extensive procedural code and error handling
-- 2. Performance bottlenecks from table-level locking and serializable isolation levels
-- 3. Limited scalability across multiple database instances and distributed architectures
-- 4. Manual rollback logic and compensation procedures for failed distributed operations
-- 5. Difficulty maintaining ACID properties across microservice boundaries and network partitions
-- 6. Complex deadlock detection and resolution in multi-table transaction scenarios
-- 7. Resource-intensive locking mechanisms impacting concurrent transaction performance
-- 8. Manual consistency management across related tables and complex foreign key relationships
-- 9. Limited support for horizontal scaling while maintaining transactional consistency
-- 10. Operational complexity of monitoring and debugging distributed transaction failures
```

MongoDB provides native multi-document transactions with distributed ACID guarantees:

```javascript
// MongoDB Multi-Document Transactions - Native distributed ACID operations with scalable consistency
const { MongoClient, ObjectId } = require('mongodb');

// Advanced MongoDB Transaction Manager for Enterprise ACID Operations
class MongoDBTransactionManager {
  constructor(client, config = {}) {
    this.client = client;
    this.db = client.db(config.database || 'enterprise_transactions');
    
    this.config = {
      // Transaction configuration
      defaultTransactionOptions: {
        readConcern: { level: config.readConcern || 'snapshot' },
        writeConcern: { w: config.writeConcern || 'majority' },
        readPreference: config.readPreference || 'primary'
      },
      maxTransactionTimeMS: config.maxTransactionTimeMS || 60000, // 1 minute
      maxRetryAttempts: config.maxRetryAttempts || 3,
      
      // Error handling and retry configuration
      enableRetryLogic: config.enableRetryLogic !== false,
      retryableErrors: config.retryableErrors || [
        'WriteConflict', 'TransientTransactionError', 'UnknownTransactionCommitResult'
      ],
      
      // Performance optimization
      enableTransactionMetrics: config.enableTransactionMetrics !== false,
      enableDeadlockDetection: config.enableDeadlockDetection !== false,
      enablePerformanceMonitoring: config.enablePerformanceMonitoring !== false,
      
      // Business logic configuration
      enableComplianceChecks: config.enableComplianceChecks !== false,
      enableAuditLogging: config.enableAuditLogging !== false,
      enableBusinessValidation: config.enableBusinessValidation !== false
    };
    
    // Transaction management state
    this.activeTransactions = new Map();
    this.transactionMetrics = new Map();
    this.deadlockStats = new Map();
    
    this.initializeTransactionManager();
  }

  async initializeTransactionManager() {
    console.log('Initializing MongoDB Transaction Manager...');
    
    try {
      // Setup transaction-aware collections with appropriate indexes
      await this.setupTransactionCollections();
      
      // Initialize performance monitoring
      if (this.config.enablePerformanceMonitoring) {
        await this.initializePerformanceMonitoring();
      }
      
      console.log('MongoDB Transaction Manager initialized successfully');
      
    } catch (error) {
      console.error('Error initializing transaction manager:', error);
      throw error;
    }
  }

  async setupTransactionCollections() {
    console.log('Setting up transaction-aware collections...');
    
    try {
      // Accounts collection with transaction-optimized indexes
      const accountsCollection = this.db.collection('accounts');
      await accountsCollection.createIndexes([
        { key: { accountNumber: 1 }, unique: true, background: true },
        { key: { userId: 1, accountType: 1 }, background: true },
        { key: { accountStatus: 1, balance: -1 }, background: true },
        { key: { lastActivity: -1 }, background: true }
      ]);
      
      // Transaction log collection for ACID audit trail
      const transactionLogCollection = this.db.collection('transaction_log');
      await transactionLogCollection.createIndexes([
        { key: { transactionTimestamp: -1 }, background: true },
        { key: { sourceAccountId: 1, transactionTimestamp: -1 }, background: true },
        { key: { destinationAccountId: 1, transactionTimestamp: -1 }, background: true },
        { key: { referenceNumber: 1 }, unique: true, sparse: true, background: true },
        { key: { transactionStatus: 1, transactionTimestamp: -1 }, background: true }
      ]);
      
      // Balance history for audit and reconciliation
      const balanceHistoryCollection = this.db.collection('balance_history');
      await balanceHistoryCollection.createIndexes([
        { key: { accountId: 1, recordedAt: -1 }, background: true },
        { key: { transactionId: 1 }, background: true },
        { key: { sequenceNumber: -1 }, background: true }
      ]);
      
      console.log('Transaction collections configured successfully');
      
    } catch (error) {
      console.error('Error setting up transaction collections:', error);
      throw error;
    }
  }

  async executeTransactionWithRetry(transactionLogic, options = {}) {
    console.log('Executing transaction with automatic retry logic...');
    
    const session = this.client.startSession();
    const transactionOptions = { 
      ...this.config.defaultTransactionOptions, 
      ...options 
    };
    
    let retryCount = 0;
    const maxRetries = this.config.maxRetryAttempts;
    const transactionId = new ObjectId();
    const startTime = Date.now();
    
    while (retryCount <= maxRetries) {
      try {
        await session.withTransaction(
          async () => {
            const transactionContext = {
              session: session,
              transactionId: transactionId,
              attempt: retryCount + 1,
              startTime: startTime,
              db: this.db
            };
            
            return await transactionLogic(transactionContext);
          },
          transactionOptions
        );
        
        // Transaction succeeded
        const duration = Date.now() - startTime;
        await this.updateTransactionMetrics(transactionId, 'completed', duration, retryCount);
        
        console.log(`Transaction completed successfully: ${transactionId} (${retryCount + 1} attempts)`);
        return { success: true, transactionId, attempts: retryCount + 1, duration };
        
      } catch (error) {
        retryCount++;
        
        const isRetryableError = this.isRetryableTransactionError(error);
        const shouldRetry = isRetryableError && retryCount <= maxRetries && this.config.enableRetryLogic;
        
        if (!shouldRetry) {
          // Transaction failed permanently
          const duration = Date.now() - startTime;
          await this.updateTransactionMetrics(transactionId, 'failed', duration, retryCount - 1);
          
          console.error(`Transaction failed permanently: ${transactionId}`, error);
          throw error;
        }
        
        // Wait before retry with exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        
        console.warn(`Transaction retry ${retryCount}/${maxRetries} for ${transactionId}: ${error.message}`);
      }
    }
    
    await session.endSession();
  }

  async transferFundsWithACID(transferRequest) {
    console.log('Processing fund transfer with ACID guarantees...');
    
    return await this.executeTransactionWithRetry(async (context) => {
      const { session, transactionId, db } = context;
      
      // Collections with session for transaction scope
      const accountsCollection = db.collection('accounts', { session });
      const transactionLogCollection = db.collection('transaction_log', { session });
      const balanceHistoryCollection = db.collection('balance_history', { session });
      
      // Step 1: Validate and lock source account
      const sourceAccount = await accountsCollection.findOneAndUpdate(
        { 
          _id: new ObjectId(transferRequest.sourceAccountId),
          accountStatus: 'active' 
        },
        { 
          $set: { 
            lastActivity: new Date(),
            lockTimestamp: new Date(),
            lockedBy: transactionId.toString()
          }
        },
        { 
          returnDocument: 'after',
          session: session 
        }
      );
      
      if (!sourceAccount.value) {
        throw new Error(`Source account not found or inactive: ${transferRequest.sourceAccountId}`);
      }
      
      // Step 2: Validate and lock destination account
      const destinationAccount = await accountsCollection.findOneAndUpdate(
        { 
          _id: new ObjectId(transferRequest.destinationAccountId),
          accountStatus: { $in: ['active', 'suspended'] } // Allow deposits to suspended accounts
        },
        { 
          $set: { 
            lastActivity: new Date(),
            lockTimestamp: new Date(),
            lockedBy: transactionId.toString()
          }
        },
        { 
          returnDocument: 'after',
          session: session 
        }
      );
      
      if (!destinationAccount.value) {
        throw new Error(`Destination account not found: ${transferRequest.destinationAccountId}`);
      }
      
      // Step 3: Business logic validation
      await this.validateTransferRequirements(
        sourceAccount.value, 
        destinationAccount.value, 
        transferRequest, 
        context
      );
      
      // Step 4: Create transaction log entry
      const transactionLog = {
        _id: new ObjectId(),
        transactionId: transactionId,
        transactionTimestamp: new Date(),
        transactionType: 'transfer',
        
        // Account information
        sourceAccountId: sourceAccount.value._id,
        destinationAccountId: destinationAccount.value._id,
        
        // Transaction details
        transactionAmount: transferRequest.amount,
        currencyCode: transferRequest.currencyCode || 'USD',
        description: transferRequest.description || 'Fund Transfer',
        referenceNumber: transferRequest.referenceNumber || this.generateReferenceNumber(),
        
        // Processing metadata
        transactionStatus: 'processing',
        processingStage: 'balance_update',
        initiatedBy: transferRequest.userId,
        sessionId: transferRequest.sessionId,
        
        // Compliance and audit
        complianceChecked: true,
        complianceResult: await this.performComplianceChecks(transferRequest, context),
        
        // Transaction context
        clientMetadata: transferRequest.metadata || {}
      };
      
      await transactionLogCollection.insertOne(transactionLog, { session });
      
      // Step 5: Update source account balance
      const sourceBalanceUpdate = await accountsCollection.findOneAndUpdate(
        { _id: sourceAccount.value._id },
        { 
          $inc: { balance: -transferRequest.amount },
          $set: { 
            lastActivity: new Date(),
            updatedBy: transferRequest.userId,
            lockTimestamp: null,
            lockedBy: null
          },
          $inc: { versionNumber: 1 }
        },
        { 
          returnDocument: 'after',
          session: session 
        }
      );
      
      // Step 6: Record source balance history
      await balanceHistoryCollection.insertOne({
        _id: new ObjectId(),
        accountId: sourceAccount.value._id,
        transactionId: transactionId,
        previousBalance: sourceAccount.value.balance,
        transactionAmount: -transferRequest.amount,
        newBalance: sourceBalanceUpdate.value.balance,
        recordedAt: new Date(),
        sequenceNumber: await this.getNextSequenceNumber(sourceAccount.value._id, context)
      }, { session });
      
      // Step 7: Update destination account balance
      const destinationBalanceUpdate = await accountsCollection.findOneAndUpdate(
        { _id: destinationAccount.value._id },
        { 
          $inc: { balance: transferRequest.amount },
          $set: { 
            lastActivity: new Date(),
            updatedBy: transferRequest.userId,
            lockTimestamp: null,
            lockedBy: null
          },
          $inc: { versionNumber: 1 }
        },
        { 
          returnDocument: 'after',
          session: session 
        }
      );
      
      // Step 8: Record destination balance history
      await balanceHistoryCollection.insertOne({
        _id: new ObjectId(),
        accountId: destinationAccount.value._id,
        transactionId: transactionId,
        previousBalance: destinationAccount.value.balance,
        transactionAmount: transferRequest.amount,
        newBalance: destinationBalanceUpdate.value.balance,
        recordedAt: new Date(),
        sequenceNumber: await this.getNextSequenceNumber(destinationAccount.value._id, context)
      }, { session });
      
      // Step 9: Update transaction log to completed
      await transactionLogCollection.updateOne(
        { transactionId: transactionId },
        { 
          $set: { 
            transactionStatus: 'completed',
            processingStage: 'completed',
            completedAt: new Date()
          }
        },
        { session }
      );
      
      // Step 10: Return transaction result
      return {
        transactionId: transactionId,
        referenceNumber: transactionLog.referenceNumber,
        sourceAccountBalance: sourceBalanceUpdate.value.balance,
        destinationAccountBalance: destinationBalanceUpdate.value.balance,
        transactionAmount: transferRequest.amount,
        completedAt: new Date()
      };
    });
  }

  async processBatchTransfers(batchRequest) {
    console.log('Processing batch transfers with distributed ACID guarantees...');
    
    return await this.executeTransactionWithRetry(async (context) => {
      const { session, transactionId, db } = context;
      const batchResults = [];
      const batchSummary = {
        batchId: transactionId,
        totalTransfers: batchRequest.transfers.length,
        successfulTransfers: 0,
        failedTransfers: 0,
        totalAmount: 0,
        processedAt: new Date()
      };
      
      // Create batch processing record
      await db.collection('batch_processing_log', { session }).insertOne({
        _id: transactionId,
        batchType: 'fund_transfers',
        initiatedBy: batchRequest.userId,
        initiatedAt: new Date(),
        totalOperations: batchRequest.transfers.length,
        batchStatus: 'processing',
        transfers: batchRequest.transfers
      });
      
      // Process each transfer within the same transaction
      for (const [index, transfer] of batchRequest.transfers.entries()) {
        try {
          // Execute individual transfer as part of the batch transaction
          const transferResult = await this.processIndividualTransferInBatch(
            transfer, 
            context, 
            index + 1
          );
          
          batchResults.push({
            sequence: index + 1,
            status: 'completed',
            transferId: transferResult.transactionId,
            amount: transfer.amount,
            result: transferResult
          });
          
          batchSummary.successfulTransfers++;
          batchSummary.totalAmount += transfer.amount;
          
        } catch (transferError) {
          batchResults.push({
            sequence: index + 1,
            status: 'failed',
            amount: transfer.amount,
            error: transferError.message
          });
          
          batchSummary.failedTransfers++;
          
          // In strict batch mode, fail entire batch if any transfer fails
          if (batchRequest.strictMode) {
            throw new Error(`Batch transfer failed at sequence ${index + 1}: ${transferError.message}`);
          }
        }
      }
      
      // Update batch completion status
      await db.collection('batch_processing_log', { session }).updateOne(
        { _id: transactionId },
        { 
          $set: { 
            batchStatus: batchSummary.failedTransfers === 0 ? 'completed_success' : 'completed_partial',
            completedAt: new Date(),
            successfulOperations: batchSummary.successfulTransfers,
            failedOperations: batchSummary.failedTransfers,
            totalAmountProcessed: batchSummary.totalAmount,
            results: batchResults
          }
        }
      );
      
      return {
        batchSummary,
        batchResults,
        transactionId: transactionId
      };
    });
  }

  async processIndividualTransferInBatch(transfer, context, sequenceNumber) {
    const { session, db } = context;
    const transferId = new ObjectId();
    
    // Validate accounts exist and are available
    const accounts = await db.collection('accounts', { session })
      .find({ 
        _id: { $in: [
          new ObjectId(transfer.sourceAccountId), 
          new ObjectId(transfer.destinationAccountId)
        ]},
        accountStatus: { $in: ['active', 'suspended'] }
      })
      .toArray();
    
    if (accounts.length !== 2) {
      throw new Error(`Invalid account(s) for transfer sequence ${sequenceNumber}`);
    }
    
    const sourceAccount = accounts.find(acc => acc._id.toString() === transfer.sourceAccountId);
    const destinationAccount = accounts.find(acc => acc._id.toString() === transfer.destinationAccountId);
    
    // Validate sufficient balance
    if (sourceAccount.balance < transfer.amount) {
      throw new Error(`Insufficient funds for transfer sequence ${sequenceNumber}`);
    }
    
    // Update balances atomically
    await Promise.all([
      db.collection('accounts', { session }).updateOne(
        { _id: sourceAccount._id },
        { 
          $inc: { balance: -transfer.amount },
          $set: { lastActivity: new Date() }
        }
      ),
      db.collection('accounts', { session }).updateOne(
        { _id: destinationAccount._id },
        { 
          $inc: { balance: transfer.amount },
          $set: { lastActivity: new Date() }
        }
      )
    ]);
    
    // Create transaction record
    await db.collection('transaction_log', { session }).insertOne({
      _id: transferId,
      batchSequence: sequenceNumber,
      parentBatchId: context.transactionId,
      transactionTimestamp: new Date(),
      transactionType: 'transfer',
      sourceAccountId: sourceAccount._id,
      destinationAccountId: destinationAccount._id,
      transactionAmount: transfer.amount,
      description: transfer.description || `Batch transfer ${sequenceNumber}`,
      transactionStatus: 'completed'
    });
    
    return {
      transactionId: transferId,
      sequenceNumber: sequenceNumber,
      amount: transfer.amount
    };
  }

  async validateTransferRequirements(sourceAccount, destinationAccount, transferRequest, context) {
    const validations = [];
    
    // Amount validation
    if (transferRequest.amount <= 0) {
      validations.push('Transfer amount must be positive');
    }
    
    // Balance validation
    const availableBalance = sourceAccount.balance + (sourceAccount.overdraftLimit || 0);
    if (availableBalance < transferRequest.amount) {
      validations.push(`Insufficient funds: available=${availableBalance}, requested=${transferRequest.amount}`);
    }
    
    // Daily limit validation
    const dailyTotal = await this.calculateDailyTransferTotal(sourceAccount._id, context);
    const dailyLimit = sourceAccount.dailyTransferLimit || 10000;
    if (dailyTotal + transferRequest.amount > dailyLimit) {
      validations.push(`Daily transfer limit exceeded: current=${dailyTotal}, limit=${dailyLimit}`);
    }
    
    // Account status validation
    if (sourceAccount.accountStatus !== 'active') {
      validations.push('Source account is not active');
    }
    
    if (destinationAccount.accountStatus === 'closed') {
      validations.push('Destination account is closed');
    }
    
    if (validations.length > 0) {
      throw new Error(`Transfer validation failed: ${validations.join(', ')}`);
    }
  }

  async performComplianceChecks(transferRequest, context) {
    if (!this.config.enableComplianceChecks) {
      return { checked: false, message: 'Compliance checks disabled' };
    }
    
    const complianceResult = {
      amlCheck: transferRequest.amount > 10000,
      crossBorderCheck: false, // Would be determined by account locations
      highRiskCheck: false,     // Would be determined by account risk scores
      kycVerified: true,        // Would be validated from account KYC status
      complianceScore: 'low',
      checkedAt: new Date()
    };
    
    // Simulate compliance processing
    if (complianceResult.amlCheck && !complianceResult.kycVerified) {
      throw new Error('Large transfers require full KYC verification');
    }
    
    return complianceResult;
  }

  async calculateDailyTransferTotal(accountId, context) {
    const { session, db } = context;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const dailyTransfers = await db.collection('transaction_log', { session })
      .aggregate([
        {
          $match: {
            sourceAccountId: accountId,
            transactionTimestamp: { $gte: startOfDay },
            transactionStatus: { $in: ['completed', 'processing'] },
            transactionType: 'transfer'
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$transactionAmount' }
          }
        }
      ])
      .toArray();
    
    return dailyTransfers[0]?.totalAmount || 0;
  }

  async getNextSequenceNumber(accountId, context) {
    const { session, db } = context;
    
    const lastHistory = await db.collection('balance_history', { session })
      .findOne(
        { accountId: accountId },
        { sort: { sequenceNumber: -1 } }
      );
    
    return (lastHistory?.sequenceNumber || 0) + 1;
  }

  generateReferenceNumber() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `TXN${timestamp}${random}`.toUpperCase();
  }

  isRetryableTransactionError(error) {
    const errorMessage = error.message || '';
    return this.config.retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError) || 
      error.hasErrorLabel?.(retryableError)
    );
  }

  async updateTransactionMetrics(transactionId, status, duration, retryCount) {
    if (!this.config.enableTransactionMetrics) return;
    
    const metrics = {
      transactionId: transactionId,
      status: status,
      duration: duration,
      retryCount: retryCount,
      timestamp: new Date()
    };
    
    this.transactionMetrics.set(transactionId.toString(), metrics);
    
    // Optionally persist metrics to database
    await this.db.collection('transaction_metrics').insertOne(metrics);
  }

  async getTransactionStatus() {
    console.log('Retrieving transaction manager status...');
    
    const status = {
      activeTransactions: this.activeTransactions.size,
      totalTransactions: this.transactionMetrics.size,
      configuration: {
        maxRetryAttempts: this.config.maxRetryAttempts,
        maxTransactionTimeMS: this.config.maxTransactionTimeMS,
        retryLogicEnabled: this.config.enableRetryLogic
      },
      performance: {
        averageTransactionTime: 0,
        successRate: 0,
        retryRate: 0
      }
    };
    
    // Calculate performance metrics
    if (this.transactionMetrics.size > 0) {
      const metrics = Array.from(this.transactionMetrics.values());
      
      status.performance.averageTransactionTime = 
        metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      
      const successfulTransactions = metrics.filter(m => m.status === 'completed').length;
      status.performance.successRate = (successfulTransactions / metrics.length) * 100;
      
      const retriedTransactions = metrics.filter(m => m.retryCount > 0).length;
      status.performance.retryRate = (retriedTransactions / metrics.length) * 100;
    }
    
    return status;
  }

  async cleanup() {
    console.log('Cleaning up Transaction Manager resources...');
    
    this.activeTransactions.clear();
    this.transactionMetrics.clear();
    this.deadlockStats.clear();
    
    console.log('Transaction Manager cleanup completed');
  }
}

// Example usage for enterprise financial operations
async function demonstrateEnterpriseTransactions() {
  const client = new MongoClient('mongodb://localhost:27017', {
    replicaSet: 'rs0' // Transactions require replica set or sharded cluster
  });
  await client.connect();
  
  const transactionManager = new MongoDBTransactionManager(client, {
    database: 'enterprise_banking',
    readConcern: 'snapshot',
    writeConcern: 'majority',
    enableRetryLogic: true,
    enableComplianceChecks: true,
    enablePerformanceMonitoring: true
  });
  
  try {
    // Create sample accounts for demonstration
    const accountsCollection = client.db('enterprise_banking').collection('accounts');
    
    const sampleAccounts = [
      {
        _id: new ObjectId(),
        accountNumber: 'ACC001',
        userId: 'user_alice',
        accountType: 'checking',
        balance: 5000.00,
        accountStatus: 'active',
        dailyTransferLimit: 10000.00,
        overdraftLimit: 500.00
      },
      {
        _id: new ObjectId(),
        accountNumber: 'ACC002',
        userId: 'user_bob',
        accountType: 'savings',
        balance: 2500.00,
        accountStatus: 'active',
        dailyTransferLimit: 5000.00,
        overdraftLimit: 0.00
      }
    ];
    
    await accountsCollection.insertMany(sampleAccounts);
    
    // Demonstrate single fund transfer with ACID guarantees
    console.log('Executing single fund transfer...');
    const transferResult = await transactionManager.transferFundsWithACID({
      sourceAccountId: sampleAccounts[0]._id.toString(),
      destinationAccountId: sampleAccounts[1]._id.toString(),
      amount: 1000.00,
      description: 'Monthly transfer',
      currencyCode: 'USD',
      userId: 'user_alice',
      sessionId: 'session_123'
    });
    
    console.log('Transfer Result:', transferResult);
    
    // Demonstrate batch transfers with distributed ACID
    console.log('Executing batch transfers...');
    const batchResult = await transactionManager.processBatchTransfers({
      transfers: [
        {
          sourceAccountId: sampleAccounts[0]._id.toString(),
          destinationAccountId: sampleAccounts[1]._id.toString(),
          amount: 250.00,
          description: 'Batch transfer 1'
        },
        {
          sourceAccountId: sampleAccounts[1]._id.toString(),
          destinationAccountId: sampleAccounts[0]._id.toString(),
          amount: 150.00,
          description: 'Batch transfer 2'
        }
      ],
      userId: 'user_system',
      strictMode: false // Allow partial success
    });
    
    console.log('Batch Result:', JSON.stringify(batchResult, null, 2));
    
    // Get transaction manager status
    const status = await transactionManager.getTransactionStatus();
    console.log('Transaction Manager Status:', status);
    
    return {
      transferResult,
      batchResult,
      status
    };
    
  } catch (error) {
    console.error('Error demonstrating enterprise transactions:', error);
    throw error;
  } finally {
    await transactionManager.cleanup();
    await client.close();
  }
}

// Benefits of MongoDB Multi-Document Transactions:
// - Native ACID guarantees across multiple documents and collections without external coordination
// - Distributed transaction support across sharded clusters and replica sets with automatic failover
// - Automatic retry logic for transient failures with exponential backoff and deadlock detection
// - Performance optimization through snapshot isolation and optimistic concurrency control
// - Seamless integration with MongoDB's document model and aggregation framework capabilities
// - Enterprise-grade consistency management with configurable read and write concerns
// - Horizontal scaling with maintained ACID properties across distributed database architectures
// - Simplified application logic without manual compensation procedures or rollback handling

module.exports = {
  MongoDBTransactionManager,
  demonstrateEnterpriseTransactions
};
```

## SQL-Style Transaction Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB transaction operations and ACID management:

```sql
-- QueryLeaf transactions with SQL-familiar multi-document ACID operations

-- Configure transaction management settings
SET transaction_isolation_level = 'snapshot';
SET transaction_write_concern = 'majority';
SET transaction_read_concern = 'snapshot';
SET enable_transaction_retry = true;
SET max_transaction_time_ms = 60000;
SET enable_deadlock_detection = true;

-- Begin distributed transaction with ACID guarantees
BEGIN TRANSACTION ISOLATION LEVEL SNAPSHOT
WITH (
  write_concern = 'majority',
  read_concern = 'snapshot',
  max_time_ms = 60000,
  retry_on_conflict = true
);

-- Create accounts with transaction-aware constraints
WITH account_setup AS (
  INSERT INTO accounts_transactional
  SELECT 
    GENERATE_UUID() as account_id,
    'ACC' || LPAD(generate_series(1, 100)::text, 6, '0') as account_number,
    'user_' || generate_series(1, 100) as user_id,
    (ARRAY['checking', 'savings', 'business'])[1 + floor(random() * 3)] as account_type,
    
    -- Balance and limits with business constraints
    ROUND((random() * 50000 + 1000)::numeric, 2) as balance,
    'USD' as currency_code,
    'active' as account_status,
    CURRENT_TIMESTAMP as opened_at,
    CURRENT_TIMESTAMP as last_activity,
    
    -- Transaction limits for compliance
    CASE account_type
      WHEN 'checking' THEN 10000.00
      WHEN 'savings' THEN 5000.00 
      WHEN 'business' THEN 50000.00
    END as daily_transfer_limit,
    
    CASE account_type
      WHEN 'checking' THEN 1000.00
      WHEN 'savings' THEN 0.00
      WHEN 'business' THEN 5000.00
    END as overdraft_limit,
    
    -- Compliance and verification
    random() > 0.1 as kyc_verified,
    (ARRAY['low', 'medium', 'high'])[1 + floor(random() * 3)] as risk_level,
    ARRAY[]::text[] as regulatory_flags,
    
    -- Audit tracking
    1 as version_number,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
  RETURNING account_id, account_number, user_id, balance, account_type
),

-- Multi-document fund transfer with full ACID guarantees
fund_transfer_transaction AS (
  -- Step 1: Validate source account with pessimistic locking
  WITH source_account_lock AS (
    SELECT 
      account_id,
      account_number,
      user_id,
      balance,
      daily_transfer_limit,
      overdraft_limit,
      account_status,
      
      -- Calculate available balance
      balance + overdraft_limit as available_balance,
      
      -- Lock account for transaction duration
      CURRENT_TIMESTAMP as locked_at,
      GENERATE_UUID() as lock_token
    FROM accounts_transactional
    WHERE account_number = 'ACC000001'  -- Source account
    AND account_status = 'active'
    FOR UPDATE -- Pessimistic lock within transaction
  ),
  
  -- Step 2: Validate destination account
  destination_account_validation AS (
    SELECT 
      account_id,
      account_number,
      user_id,
      balance,
      account_status
    FROM accounts_transactional
    WHERE account_number = 'ACC000002'  -- Destination account
    AND account_status IN ('active', 'suspended') -- Allow deposits to suspended accounts
    FOR UPDATE -- Lock destination account
  ),
  
  -- Step 3: Business logic validation
  transfer_validation AS (
    SELECT 
      sal.*,
      dav.account_id as dest_account_id,
      dav.account_number as dest_account_number,
      dav.balance as dest_balance,
      
      -- Transfer parameters
      1500.00 as transfer_amount,
      'Monthly rent payment' as transfer_description,
      'user_alice' as initiated_by,
      'session_abc123' as session_id,
      
      -- Validation results
      CASE 
        WHEN 1500.00 <= 0 THEN 'INVALID_AMOUNT'
        WHEN sal.available_balance < 1500.00 THEN 'INSUFFICIENT_FUNDS'
        WHEN sal.account_status != 'active' THEN 'INVALID_SOURCE_ACCOUNT'
        WHEN dav.account_status = 'closed' THEN 'INVALID_DESTINATION_ACCOUNT'
        ELSE 'VALID'
      END as validation_result,
      
      -- Generate transaction identifiers
      GENERATE_UUID() as transaction_id,
      'TXN' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint || FLOOR(random() * 1000) as reference_number
      
    FROM source_account_lock sal
    CROSS JOIN destination_account_validation dav
  ),
  
  -- Step 4: Daily limit validation
  daily_limit_check AS (
    SELECT 
      tv.*,
      COALESCE(daily_totals.daily_amount, 0) as current_daily_total,
      
      CASE 
        WHEN tv.validation_result != 'VALID' THEN tv.validation_result
        WHEN COALESCE(daily_totals.daily_amount, 0) + tv.transfer_amount > tv.daily_transfer_limit THEN 'DAILY_LIMIT_EXCEEDED'
        ELSE 'VALID'
      END as final_validation_result
      
    FROM transfer_validation tv
    LEFT JOIN (
      -- Calculate daily transfer total for source account
      SELECT 
        source_account_id,
        SUM(transaction_amount) as daily_amount
      FROM transaction_log_acid
      WHERE source_account_id = tv.account_id
      AND transaction_timestamp >= CURRENT_DATE
      AND transaction_status IN ('completed', 'processing')
      AND transaction_type = 'transfer'
      GROUP BY source_account_id
    ) daily_totals ON daily_totals.source_account_id = tv.account_id
  ),
  
  -- Step 5: Create transaction log entry (within transaction scope)
  transaction_log_entry AS (
    INSERT INTO transaction_log_acid
    SELECT 
      dlc.transaction_id,
      CURRENT_TIMESTAMP as transaction_timestamp,
      'transfer' as transaction_type,
      dlc.account_id as source_account_id,
      dlc.dest_account_id as destination_account_id,
      
      -- Transaction details
      dlc.transfer_amount as transaction_amount,
      'USD' as currency_code,
      dlc.transfer_description as description,
      dlc.reference_number,
      
      -- Processing status
      'processing' as transaction_status,
      'balance_update' as processing_stage,
      dlc.initiated_by,
      dlc.session_id,
      
      -- Compliance and audit
      true as compliance_checked,
      JSON_BUILD_OBJECT(
        'amount_threshold', dlc.transfer_amount > 10000,
        'daily_limit_check', dlc.current_daily_total + dlc.transfer_amount <= dlc.daily_transfer_limit,
        'kyc_verified', true, -- Would be validated from account data
        'risk_assessment', 'low'
      ) as compliance_result,
      
      -- Error handling
      CASE dlc.final_validation_result
        WHEN 'VALID' THEN NULL
        ELSE dlc.final_validation_result
      END as error_code,
      
      CURRENT_TIMESTAMP as created_at
    FROM daily_limit_check dlc
    WHERE dlc.final_validation_result = 'VALID' -- Only insert if validation passes
    RETURNING transaction_id, reference_number, transaction_amount
  ),
  
  -- Step 6: Update source account balance (atomic operation)
  source_balance_update AS (
    UPDATE accounts_transactional 
    SET 
      balance = balance - tle.transaction_amount,
      last_activity = CURRENT_TIMESTAMP,
      version_number = version_number + 1,
      updated_at = CURRENT_TIMESTAMP
    FROM transaction_log_entry tle
    WHERE accounts_transactional.account_id = (
      SELECT account_id FROM daily_limit_check WHERE final_validation_result = 'VALID'
    )
    RETURNING account_id, balance as new_balance, version_number
  ),
  
  -- Step 7: Update destination account balance (atomic operation)
  destination_balance_update AS (
    UPDATE accounts_transactional 
    SET 
      balance = balance + tle.transaction_amount,
      last_activity = CURRENT_TIMESTAMP,
      version_number = version_number + 1,
      updated_at = CURRENT_TIMESTAMP
    FROM transaction_log_entry tle
    WHERE accounts_transactional.account_id = (
      SELECT dest_account_id FROM daily_limit_check WHERE final_validation_result = 'VALID'
    )
    RETURNING account_id, balance as new_balance, version_number
  ),
  
  -- Step 8: Create balance history records for audit trail
  balance_history_records AS (
    INSERT INTO balance_history_acid
    SELECT 
      GENERATE_UUID() as history_id,
      account_updates.account_id,
      tle.transaction_id,
      
      -- Balance change details
      dlc.balance as previous_balance, -- Source account original balance
      account_updates.balance_change as transaction_amount,
      account_updates.new_balance,
      account_updates.new_balance as running_balance,
      
      -- Audit metadata
      CURRENT_TIMESTAMP as recorded_at,
      ROW_NUMBER() OVER (PARTITION BY account_updates.account_id ORDER BY CURRENT_TIMESTAMP) as sequence_number,
      true as balance_verified,
      CURRENT_TIMESTAMP as verification_timestamp
      
    FROM transaction_log_entry tle
    CROSS JOIN (
      -- Union source and destination balance changes
      SELECT sbu.account_id, -tle.transaction_amount as balance_change, sbu.new_balance
      FROM source_balance_update sbu, transaction_log_entry tle
      
      UNION ALL
      
      SELECT dbu.account_id, tle.transaction_amount as balance_change, dbu.new_balance  
      FROM destination_balance_update dbu, transaction_log_entry tle
    ) account_updates
    CROSS JOIN daily_limit_check dlc -- For previous balance reference
    RETURNING history_id, account_id, new_balance
  ),
  
  -- Step 9: Finalize transaction log status
  transaction_completion AS (
    UPDATE transaction_log_acid 
    SET 
      transaction_status = 'completed',
      processing_stage = 'completed',
      completed_at = CURRENT_TIMESTAMP
    FROM transaction_log_entry tle
    WHERE transaction_log_acid.transaction_id = tle.transaction_id
    RETURNING transaction_id, reference_number, completed_at
  )
  
  -- Step 10: Return comprehensive transaction result
  SELECT 
    tc.transaction_id,
    tc.reference_number,
    tle.transaction_amount,
    tc.completed_at,
    
    -- Account balance results
    sbu.new_balance as source_new_balance,
    dbu.new_balance as destination_new_balance,
    
    -- Transaction metadata
    dlc.account_number as source_account,
    dlc.dest_account_number as destination_account,
    dlc.initiated_by,
    
    -- Validation and compliance results
    dlc.final_validation_result as validation_status,
    'ACID_GUARANTEED' as consistency_model,
    'completed' as transaction_status,
    
    -- Performance metrics
    EXTRACT(EPOCH FROM (tc.completed_at - tle.created_at)) * 1000 as processing_time_ms,
    sbu.version_number as source_account_version,
    dbu.version_number as destination_account_version,
    
    -- Audit trail references
    ARRAY_AGG(bhr.history_id) as balance_history_ids
    
  FROM transaction_completion tc
  JOIN transaction_log_entry tle ON tc.transaction_id = tle.transaction_id
  JOIN source_balance_update sbu ON sbu.account_id IS NOT NULL
  JOIN destination_balance_update dbu ON dbu.account_id IS NOT NULL
  JOIN daily_limit_check dlc ON dlc.final_validation_result = 'VALID'
  LEFT JOIN balance_history_records bhr ON bhr.account_id IN (sbu.account_id, dbu.account_id)
  GROUP BY tc.transaction_id, tc.reference_number, tle.transaction_amount, tc.completed_at,
           sbu.new_balance, dbu.new_balance, dlc.account_number, dlc.dest_account_number,
           dlc.initiated_by, dlc.final_validation_result, tle.created_at,
           sbu.version_number, dbu.version_number
)

-- Commit transaction with ACID guarantees
COMMIT TRANSACTION;

-- Batch transaction processing with distributed ACID
BEGIN TRANSACTION ISOLATION LEVEL SNAPSHOT
WITH (
  write_concern = 'majority',
  read_concern = 'snapshot',
  enable_batch_operations = true,
  max_batch_size = 1000
);

WITH batch_transfer_processing AS (
  -- Define batch transfer specifications
  WITH transfer_batch AS (
    SELECT 
      batch_spec.*,
      GENERATE_UUID() as batch_transaction_id,
      ROW_NUMBER() OVER (ORDER BY batch_spec.source_account) as batch_sequence
    FROM (VALUES
      ('ACC000001', 'ACC000002', 500.00, 'Batch transfer 1'),
      ('ACC000003', 'ACC000001', 750.00, 'Batch transfer 2'), 
      ('ACC000002', 'ACC000004', 300.00, 'Batch transfer 3'),
      ('ACC000004', 'ACC000003', 450.00, 'Batch transfer 4')
    ) AS batch_spec(source_account, destination_account, amount, description)
  ),
  
  -- Create batch processing log
  batch_initialization AS (
    INSERT INTO batch_processing_log_acid
    SELECT 
      tb.batch_transaction_id,
      'fund_transfers' as batch_type,
      'system_batch_processor' as initiated_by,
      CURRENT_TIMESTAMP as initiated_at,
      COUNT(*) as total_operations,
      'processing' as batch_status,
      
      -- Batch configuration
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'sequence', tb.batch_sequence,
          'source', tb.source_account,
          'destination', tb.destination_account,
          'amount', tb.amount,
          'description', tb.description
        ) ORDER BY tb.batch_sequence
      ) as batch_operations
      
    FROM transfer_batch tb
    GROUP BY tb.batch_transaction_id
    RETURNING batch_transaction_id, total_operations
  ),
  
  -- Process all transfers within single transaction scope
  batch_execution AS (
    -- Validate all accounts first (prevents partial failures)
    WITH account_validation AS (
      SELECT 
        tb.batch_sequence,
        tb.batch_transaction_id,
        
        -- Source account details
        sa.account_id as source_id,
        sa.account_number as source_account,
        sa.balance as source_balance,
        sa.daily_transfer_limit as source_limit,
        sa.overdraft_limit as source_overdraft,
        
        -- Destination account details  
        da.account_id as dest_id,
        da.account_number as dest_account,
        da.balance as dest_balance,
        
        -- Transfer details
        tb.amount,
        tb.description,
        
        -- Validation logic
        CASE 
          WHEN sa.account_id IS NULL THEN 'SOURCE_NOT_FOUND'
          WHEN da.account_id IS NULL THEN 'DESTINATION_NOT_FOUND'
          WHEN sa.account_status != 'active' THEN 'SOURCE_INACTIVE'
          WHEN da.account_status = 'closed' THEN 'DESTINATION_CLOSED'
          WHEN tb.amount <= 0 THEN 'INVALID_AMOUNT'
          WHEN sa.balance + sa.overdraft_limit < tb.amount THEN 'INSUFFICIENT_FUNDS'
          ELSE 'VALID'
        END as validation_status
        
      FROM transfer_batch tb
      LEFT JOIN accounts_transactional sa ON sa.account_number = tb.source_account
      LEFT JOIN accounts_transactional da ON da.account_number = tb.destination_account
      FOR UPDATE -- Lock all involved accounts
    ),
    
    -- Execute valid transfers atomically
    balance_updates AS (
      UPDATE accounts_transactional 
      SET 
        balance = CASE 
          WHEN account_id IN (SELECT source_id FROM account_validation WHERE validation_status = 'VALID')
          THEN balance - (SELECT amount FROM account_validation av WHERE av.source_id = accounts_transactional.account_id AND validation_status = 'VALID')
          
          WHEN account_id IN (SELECT dest_id FROM account_validation WHERE validation_status = 'VALID')
          THEN balance + (SELECT amount FROM account_validation av WHERE av.dest_id = accounts_transactional.account_id AND validation_status = 'VALID')
          
          ELSE balance
        END,
        last_activity = CURRENT_TIMESTAMP,
        version_number = version_number + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE account_id IN (
        SELECT source_id FROM account_validation WHERE validation_status = 'VALID'
        UNION
        SELECT dest_id FROM account_validation WHERE validation_status = 'VALID'
      )
      RETURNING account_id, balance, version_number
    ),
    
    -- Create transaction log entries for all transfers
    transaction_logging AS (
      INSERT INTO transaction_log_acid
      SELECT 
        GENERATE_UUID() as transaction_id,
        av.batch_transaction_id as parent_batch_id,
        av.batch_sequence,
        CURRENT_TIMESTAMP as transaction_timestamp,
        'transfer' as transaction_type,
        
        av.source_id as source_account_id,
        av.dest_id as destination_account_id,
        av.amount as transaction_amount,
        'USD' as currency_code,
        av.description,
        
        'TXN_BATCH_' || av.batch_transaction_id || '_' || av.batch_sequence as reference_number,
        
        -- Status based on validation
        CASE av.validation_status
          WHEN 'VALID' THEN 'completed'
          ELSE 'failed'
        END as transaction_status,
        
        'batch_processing' as processing_stage,
        'system_batch_processor' as initiated_by,
        
        -- Error details for failed transfers
        CASE av.validation_status 
          WHEN 'VALID' THEN NULL
          ELSE av.validation_status
        END as error_code,
        
        CURRENT_TIMESTAMP as created_at,
        CASE av.validation_status WHEN 'VALID' THEN CURRENT_TIMESTAMP ELSE NULL END as completed_at
        
      FROM account_validation av
      RETURNING transaction_id, batch_sequence, transaction_status, transaction_amount
    ),
    
    -- Update batch processing status
    batch_completion AS (
      UPDATE batch_processing_log_acid 
      SET 
        batch_status = CASE 
          WHEN (SELECT COUNT(*) FROM transaction_logging WHERE transaction_status = 'failed') = 0 THEN 'completed_success'
          WHEN (SELECT COUNT(*) FROM transaction_logging WHERE transaction_status = 'completed') = 0 THEN 'completed_failure'
          ELSE 'completed_partial'
        END,
        completed_at = CURRENT_TIMESTAMP,
        successful_operations = (SELECT COUNT(*) FROM transaction_logging WHERE transaction_status = 'completed'),
        failed_operations = (SELECT COUNT(*) FROM transaction_logging WHERE transaction_status = 'failed'),
        total_amount_processed = (SELECT SUM(transaction_amount) FROM transaction_logging WHERE transaction_status = 'completed')
      FROM batch_initialization bi
      WHERE batch_processing_log_acid.batch_transaction_id = bi.batch_transaction_id
      RETURNING batch_transaction_id, batch_status, successful_operations, failed_operations, total_amount_processed
    )
    
    -- Return comprehensive batch results
    SELECT 
      bc.batch_transaction_id,
      bc.batch_status,
      bc.successful_operations,
      bc.failed_operations,
      bc.total_amount_processed,
      
      -- Timing and performance
      EXTRACT(EPOCH FROM (bc.completed_at - bi.initiated_at)) * 1000 as batch_processing_time_ms,
      bi.total_operations as planned_operations,
      
      -- Success rate calculation
      ROUND(
        (bc.successful_operations::decimal / bi.total_operations::decimal) * 100, 
        2
      ) as success_rate_percent,
      
      -- Transaction details summary
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'sequence', tl.batch_sequence,
          'status', tl.transaction_status,
          'amount', tl.transaction_amount,
          'transaction_id', tl.transaction_id,
          'error', tl.error_code
        ) ORDER BY tl.batch_sequence
      ) as transaction_results,
      
      -- ACID guarantees confirmation
      'ACID_GUARANTEED' as consistency_model,
      'DISTRIBUTED_TRANSACTION' as execution_model,
      COUNT(DISTINCT bu.account_id) as accounts_modified
      
    FROM batch_completion bc
    JOIN batch_initialization bi ON bc.batch_transaction_id = bi.batch_transaction_id
    LEFT JOIN transaction_logging tl ON tl.parent_batch_id = bc.batch_transaction_id
    LEFT JOIN balance_updates bu ON bu.account_id IS NOT NULL
    GROUP BY bc.batch_transaction_id, bc.batch_status, bc.successful_operations, 
             bc.failed_operations, bc.total_amount_processed, bc.completed_at,
             bi.initiated_at, bi.total_operations
  )
  
  SELECT * FROM batch_execution
)

COMMIT TRANSACTION;

-- Transaction performance monitoring and optimization
WITH transaction_performance_analysis AS (
  SELECT 
    DATE_TRUNC('hour', transaction_timestamp) as hour_period,
    transaction_type,
    transaction_status,
    
    -- Volume metrics
    COUNT(*) as transaction_count,
    SUM(transaction_amount) as total_amount,
    AVG(transaction_amount) as avg_amount,
    
    -- Performance metrics  
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as avg_processing_time_ms,
    MAX(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as max_processing_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as p95_processing_time_ms,
    
    -- Success rate analysis
    ROUND(
      (COUNT(*) FILTER (WHERE transaction_status = 'completed')::decimal / COUNT(*)::decimal) * 100,
      2
    ) as success_rate_percent,
    
    -- Error analysis
    COUNT(*) FILTER (WHERE transaction_status = 'failed') as failed_transactions,
    STRING_AGG(DISTINCT error_code, ', ') as error_types,
    
    -- ACID consistency metrics
    COUNT(DISTINCT source_account_id) as unique_source_accounts,
    COUNT(DISTINCT destination_account_id) as unique_destination_accounts,
    AVG(CASE WHEN transaction_status = 'completed' THEN 1.0 ELSE 0.0 END) as acid_consistency_score
    
  FROM transaction_log_acid
  WHERE transaction_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', transaction_timestamp), transaction_type, transaction_status
),

-- Transaction optimization recommendations
optimization_recommendations AS (
  SELECT 
    tpa.hour_period,
    tpa.transaction_type,
    tpa.transaction_count,
    tpa.success_rate_percent,
    tpa.avg_processing_time_ms,
    tpa.acid_consistency_score,
    
    -- Performance assessment
    CASE 
      WHEN tpa.avg_processing_time_ms < 100 THEN 'excellent'
      WHEN tpa.avg_processing_time_ms < 500 THEN 'good'
      WHEN tpa.avg_processing_time_ms < 2000 THEN 'acceptable'
      ELSE 'needs_optimization'
    END as performance_rating,
    
    -- Optimization recommendations
    CASE 
      WHEN tpa.success_rate_percent < 95 THEN 'Investigate transaction failures and implement retry logic'
      WHEN tpa.avg_processing_time_ms > 1000 THEN 'Optimize transaction scope and reduce lock contention'
      WHEN tpa.unique_source_accounts > 100 THEN 'Consider transaction sharding and load balancing'
      WHEN tpa.transaction_count > 1000 THEN 'Implement batch processing for high-volume scenarios'
      ELSE 'Transaction performance within optimal parameters'
    END as optimization_recommendation,
    
    -- Capacity planning
    CASE 
      WHEN tpa.transaction_count > 5000 THEN 'high_volume'
      WHEN tpa.transaction_count > 1000 THEN 'medium_volume' 
      ELSE 'low_volume'
    END as volume_classification,
    
    -- ACID compliance status
    CASE 
      WHEN tpa.acid_consistency_score = 1.0 THEN 'full_acid_compliance'
      WHEN tpa.acid_consistency_score > 0.99 THEN 'high_acid_compliance'
      WHEN tpa.acid_consistency_score > 0.95 THEN 'acceptable_acid_compliance'
      ELSE 'acid_compliance_issues'
    END as consistency_status
    
  FROM transaction_performance_analysis tpa
)

-- Generate comprehensive transaction management dashboard
SELECT 
  or_.hour_period,
  or_.transaction_type,
  or_.transaction_count,
  or_.success_rate_percent || '%' as success_rate,
  ROUND(or_.avg_processing_time_ms, 2) || ' ms' as avg_processing_time,
  or_.performance_rating,
  or_.consistency_status,
  or_.volume_classification,
  
  -- Operational guidance
  or_.optimization_recommendation,
  
  -- Action priorities
  CASE 
    WHEN or_.performance_rating = 'needs_optimization' THEN 'high'
    WHEN or_.consistency_status LIKE '%issues' THEN 'high'
    WHEN or_.success_rate_percent < 98 THEN 'medium'
    WHEN or_.volume_classification = 'high_volume' THEN 'medium'
    ELSE 'low'
  END as action_priority,
  
  -- Technical recommendations
  CASE or_.performance_rating
    WHEN 'needs_optimization' THEN 'Reduce transaction scope, optimize indexes, implement connection pooling'
    WHEN 'acceptable' THEN 'Monitor transaction patterns, consider batch optimizations'
    ELSE 'Continue monitoring performance trends'
  END as technical_recommendations,
  
  -- Business impact assessment
  CASE 
    WHEN or_.success_rate_percent < 99 AND or_.volume_classification = 'high_volume' THEN 'High business impact - immediate attention required'
    WHEN or_.performance_rating = 'needs_optimization' THEN 'Moderate business impact - performance degradation affecting user experience'
    WHEN or_.consistency_status LIKE '%issues' THEN 'High business impact - data consistency risks'
    ELSE 'Low business impact - systems operating within acceptable parameters'
  END as business_impact_assessment,
  
  -- Success metrics and KPIs
  JSON_BUILD_OBJECT(
    'transaction_throughput', or_.transaction_count,
    'data_consistency_score', ROUND(or_.acid_consistency_score * 100, 2),
    'system_reliability', or_.success_rate_percent,
    'performance_efficiency', 
      CASE or_.performance_rating
        WHEN 'excellent' THEN 100
        WHEN 'good' THEN 80
        WHEN 'acceptable' THEN 60
        ELSE 40
      END,
    'operational_maturity',
      CASE 
        WHEN or_.success_rate_percent >= 99 AND or_.performance_rating IN ('excellent', 'good') THEN 'advanced'
        WHEN or_.success_rate_percent >= 95 AND or_.performance_rating != 'needs_optimization' THEN 'intermediate'
        ELSE 'basic'
      END
  ) as performance_kpis

FROM optimization_recommendations or_
ORDER BY 
  CASE action_priority 
    WHEN 'high' THEN 1 
    WHEN 'medium' THEN 2 
    ELSE 3 
  END,
  or_.transaction_count DESC;

-- QueryLeaf provides comprehensive MongoDB transaction capabilities:
-- 1. Native multi-document ACID operations with SQL-familiar transaction syntax
-- 2. Distributed transaction support across replica sets and sharded clusters
-- 3. Automatic retry logic with deadlock detection and conflict resolution
-- 4. Enterprise-grade consistency management with configurable isolation levels  
-- 5. Performance optimization through snapshot isolation and optimistic concurrency
-- 6. Comprehensive transaction monitoring with performance analysis and recommendations
-- 7. Business logic integration with compliance checks and audit trails
-- 8. Scalable batch processing with maintained ACID guarantees across high-volume operations
-- 9. SQL-style transaction management for familiar distributed system consistency patterns
-- 10. Advanced error handling and recovery procedures for mission-critical applications
```

## Best Practices for MongoDB Transaction Implementation

### Enterprise Transaction Design

Essential practices for implementing MongoDB transactions effectively:

1. **Transaction Scope Optimization**: Design transaction boundaries to minimize lock duration while maintaining business logic integrity
2. **Read/Write Concern Configuration**: Configure appropriate read and write concerns based on consistency requirements and performance needs
3. **Retry Logic Implementation**: Implement comprehensive retry logic for transient failures with exponential backoff strategies
4. **Performance Monitoring**: Establish monitoring for transaction performance, success rates, and resource utilization
5. **Deadlock Prevention**: Design transaction ordering and timeout strategies to minimize deadlock scenarios
6. **Error Handling Strategy**: Implement robust error handling with appropriate compensation procedures for failed operations

### Production Deployment and Scalability

Optimize MongoDB transactions for enterprise-scale requirements:

1. **Index Strategy**: Design indexes that support transaction workloads while minimizing lock contention
2. **Connection Management**: Implement connection pooling and session management for optimal transaction performance
3. **Sharding Considerations**: Plan transaction patterns that work effectively across sharded cluster architectures
4. **Resource Planning**: Plan for transaction overhead in capacity models and performance baselines
5. **Monitoring and Alerting**: Implement comprehensive monitoring for transaction health, performance trends, and failure patterns
6. **Business Continuity**: Design transaction patterns that support high availability and disaster recovery requirements

## Conclusion

MongoDB's multi-document transactions provide comprehensive ACID guarantees that enable complex business operations while maintaining data integrity across distributed architectures. The native transaction support eliminates the complexity of manual coordination procedures while providing enterprise-grade consistency management and performance optimization.

Key MongoDB Transaction benefits include:

- **Native ACID Guarantees**: Full ACID properties across multiple documents and collections without external coordination
- **Distributed Consistency**: Transactions work seamlessly across replica sets and sharded clusters with automatic failover
- **Performance Optimization**: Snapshot isolation and optimistic concurrency control for minimal lock contention
- **Automatic Recovery**: Built-in retry logic and deadlock detection for robust transaction processing
- **Horizontal Scaling**: ACID guarantees maintained across distributed database architectures
- **SQL Accessibility**: Familiar transaction management through SQL-style syntax and operational patterns

Whether you're building financial systems, e-commerce platforms, inventory management, or any application requiring strong consistency guarantees, MongoDB transactions with QueryLeaf's familiar SQL interface provide the foundation for reliable, scalable, and maintainable data operations.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB transactions while providing SQL-familiar syntax for multi-document ACID operations, consistency management, and transaction monitoring. Advanced transaction patterns, error handling strategies, and performance optimization techniques are seamlessly accessible through familiar SQL constructs, making sophisticated transaction management both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's distributed transaction capabilities with SQL-style consistency management makes it an ideal platform for applications requiring both strong data integrity guarantees and familiar operational patterns, ensuring your transaction strategies scale efficiently while maintaining enterprise-grade reliability and consistency.