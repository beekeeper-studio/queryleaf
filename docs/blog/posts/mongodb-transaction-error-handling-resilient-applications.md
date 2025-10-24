---
title: "MongoDB Transaction Error Handling and Recovery Patterns: Building Resilient Applications with Advanced Error Management and Automatic Retry Strategies"
description: "Master MongoDB transaction error handling with comprehensive recovery patterns, automatic retry strategies, and resilient application design. Learn advanced error management techniques for production-grade MongoDB applications."
date: 2025-10-23
tags: [mongodb, transactions, error-handling, resilience, recovery-patterns, production, reliability, sql]
---

# MongoDB Transaction Error Handling and Recovery Patterns: Building Resilient Applications with Advanced Error Management and Automatic Retry Strategies

Production MongoDB applications require sophisticated error handling and recovery mechanisms that can gracefully manage transaction failures, network interruptions, server unavailability, and resource constraints while maintaining data consistency and application reliability. Traditional database error handling approaches often lack the nuanced understanding of distributed system challenges, leading to incomplete transactions, data inconsistencies, and poor user experiences when dealing with complex failure scenarios.

MongoDB provides comprehensive transaction error handling capabilities through intelligent retry mechanisms, detailed error classification, and sophisticated recovery patterns that enable applications to maintain consistency and reliability even in the face of network partitions, replica set failovers, and resource contention. Unlike traditional databases that provide basic error codes and limited retry logic, MongoDB transactions integrate advanced error detection with automatic recovery strategies and detailed diagnostic information.

## The Traditional Transaction Error Handling Challenge

Conventional approaches to database transaction error management in enterprise applications face significant limitations in resilience and recovery capabilities:

```sql
-- Traditional PostgreSQL transaction error handling - basic error management with limited recovery options

-- Simple transaction error tracking table
CREATE TABLE transaction_error_log (
    error_id SERIAL PRIMARY KEY,
    transaction_id UUID,
    connection_id VARCHAR(100),
    
    -- Basic error information
    error_code VARCHAR(20),
    error_message TEXT,
    error_category VARCHAR(50), -- connection, constraint, timeout, etc.
    
    -- Timing information
    transaction_start_time TIMESTAMP,
    error_occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Context information (limited)
    table_name VARCHAR(100),
    operation_type VARCHAR(20), -- INSERT, UPDATE, DELETE, SELECT
    affected_rows INTEGER,
    
    -- Simple retry tracking
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    retry_successful BOOLEAN DEFAULT FALSE,
    
    -- Manual resolution tracking
    resolved_at TIMESTAMP,
    resolution_method VARCHAR(100),
    resolved_by VARCHAR(100)
);

-- Basic transaction state tracking
CREATE TABLE active_transactions (
    transaction_id UUID PRIMARY KEY,
    connection_id VARCHAR(100) NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Simple state management
    transaction_status VARCHAR(20) DEFAULT 'active', -- active, committed, rolled_back, failed
    isolation_level VARCHAR(30),
    read_only BOOLEAN DEFAULT FALSE,
    
    -- Basic operation tracking
    operations_count INTEGER DEFAULT 0,
    tables_affected TEXT[], -- Simple array of table names
    
    -- Timeout management (basic)
    timeout_seconds INTEGER DEFAULT 300,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Error tracking
    error_count INTEGER DEFAULT 0,
    last_error_message TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Manual transaction recovery procedure (limited functionality)
CREATE OR REPLACE FUNCTION recover_failed_transaction(
    p_transaction_id UUID,
    p_recovery_strategy VARCHAR(50) DEFAULT 'rollback'
) RETURNS TABLE (
    recovery_status VARCHAR(20),
    recovery_message TEXT,
    operations_recovered INTEGER
) AS $$
DECLARE
    v_transaction_record RECORD;
    v_recovery_count INTEGER := 0;
    v_retry_count INTEGER;
    v_max_retries INTEGER;
BEGIN
    -- Get transaction details
    SELECT * INTO v_transaction_record 
    FROM active_transactions 
    WHERE transaction_id = p_transaction_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'error'::VARCHAR(20), 
                           'Transaction not found'::TEXT, 
                           0::INTEGER;
        RETURN;
    END IF;
    
    -- Check retry limits (basic logic)
    SELECT retry_count, max_retries INTO v_retry_count, v_max_retries
    FROM transaction_error_log
    WHERE transaction_id = p_transaction_id
    ORDER BY error_occurred_at DESC
    LIMIT 1;
    
    IF v_retry_count >= v_max_retries THEN
        RETURN QUERY SELECT 'failed'::VARCHAR(20), 
                           'Maximum retries exceeded'::TEXT, 
                           0::INTEGER;
        RETURN;
    END IF;
    
    -- Simple recovery strategies
    CASE p_recovery_strategy
        WHEN 'rollback' THEN
            BEGIN
                -- Attempt to rollback (very basic)
                UPDATE active_transactions 
                SET transaction_status = 'rolled_back',
                    updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = p_transaction_id;
                
                v_recovery_count := 1;
                
                RETURN QUERY SELECT 'success'::VARCHAR(20), 
                                   'Transaction rolled back'::TEXT, 
                                   v_recovery_count::INTEGER;
            EXCEPTION WHEN OTHERS THEN
                RETURN QUERY SELECT 'error'::VARCHAR(20), 
                                   SQLERRM::TEXT, 
                                   0::INTEGER;
            END;
            
        WHEN 'retry' THEN
            BEGIN
                -- Basic retry logic (very limited)
                UPDATE transaction_error_log 
                SET retry_count = retry_count + 1,
                    retry_successful = FALSE
                WHERE transaction_id = p_transaction_id;
                
                -- Reset transaction status for retry
                UPDATE active_transactions 
                SET transaction_status = 'active',
                    error_count = 0,
                    last_error_message = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = p_transaction_id;
                
                v_recovery_count := 1;
                
                RETURN QUERY SELECT 'retry'::VARCHAR(20), 
                                   'Transaction queued for retry'::TEXT, 
                                   v_recovery_count::INTEGER;
            EXCEPTION WHEN OTHERS THEN
                RETURN QUERY SELECT 'error'::VARCHAR(20), 
                                   SQLERRM::TEXT, 
                                   0::INTEGER;
            END;
            
        ELSE
            RETURN QUERY SELECT 'error'::VARCHAR(20), 
                               'Unknown recovery strategy'::TEXT, 
                               0::INTEGER;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Basic transaction monitoring query (limited insights)
WITH transaction_health AS (
    SELECT 
        DATE_TRUNC('hour', start_time) as hour_bucket,
        
        -- Simple transaction metrics
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN transaction_status = 'committed' THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN transaction_status = 'rolled_back' THEN 1 END) as rolled_back_transactions,
        COUNT(CASE WHEN transaction_status = 'failed' THEN 1 END) as failed_transactions,
        COUNT(CASE WHEN transaction_status = 'active' AND 
                        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_activity)) > timeout_seconds 
                  THEN 1 END) as timed_out_transactions,
        
        -- Basic performance metrics
        AVG(operations_count) as avg_operations_per_transaction,
        AVG(EXTRACT(EPOCH FROM (updated_at - start_time))) as avg_transaction_duration_seconds,
        
        -- Simple error analysis
        AVG(error_count) as avg_errors_per_transaction,
        COUNT(CASE WHEN error_count > 0 THEN 1 END) as transactions_with_errors
        
    FROM active_transactions
    WHERE start_time >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY DATE_TRUNC('hour', start_time)
),

error_analysis AS (
    SELECT 
        DATE_TRUNC('hour', error_occurred_at) as hour_bucket,
        error_category,
        
        -- Error statistics
        COUNT(*) as error_count,
        COUNT(CASE WHEN retry_successful = TRUE THEN 1 END) as successful_retries,
        AVG(retry_count) as avg_retry_attempts,
        
        -- Common errors
        COUNT(CASE WHEN error_code LIKE 'SQLSTATE%' THEN 1 END) as sql_state_errors,
        COUNT(CASE WHEN error_message ILIKE '%timeout%' THEN 1 END) as timeout_errors,
        COUNT(CASE WHEN error_message ILIKE '%connection%' THEN 1 END) as connection_errors,
        COUNT(CASE WHEN error_message ILIKE '%deadlock%' THEN 1 END) as deadlock_errors
        
    FROM transaction_error_log
    WHERE error_occurred_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY DATE_TRUNC('hour', error_occurred_at), error_category
)

SELECT 
    th.hour_bucket,
    
    -- Transaction metrics
    th.total_transactions,
    th.successful_transactions,
    th.failed_transactions,
    ROUND((th.successful_transactions::DECIMAL / GREATEST(th.total_transactions, 1)) * 100, 2) as success_rate_percent,
    
    -- Performance metrics
    ROUND(th.avg_transaction_duration_seconds, 3) as avg_duration_seconds,
    ROUND(th.avg_operations_per_transaction, 1) as avg_operations,
    
    -- Error metrics
    COALESCE(SUM(ea.error_count), 0) as total_errors,
    COALESCE(SUM(ea.successful_retries), 0) as successful_retries,
    COALESCE(ROUND(AVG(ea.avg_retry_attempts), 1), 0) as avg_retry_attempts,
    
    -- Error categories
    COALESCE(SUM(ea.timeout_errors), 0) as timeout_errors,
    COALESCE(SUM(ea.connection_errors), 0) as connection_errors,
    COALESCE(SUM(ea.deadlock_errors), 0) as deadlock_errors,
    
    -- Health indicators
    th.timed_out_transactions,
    CASE 
        WHEN ROUND((th.successful_transactions::DECIMAL / GREATEST(th.total_transactions, 1)) * 100, 2) >= 95 THEN 'Healthy'
        WHEN ROUND((th.successful_transactions::DECIMAL / GREATEST(th.total_transactions, 1)) * 100, 2) >= 90 THEN 'Warning'
        ELSE 'Critical'
    END as health_status

FROM transaction_health th
LEFT JOIN error_analysis ea ON th.hour_bucket = ea.hour_bucket
GROUP BY th.hour_bucket, th.total_transactions, th.successful_transactions, 
         th.failed_transactions, th.avg_transaction_duration_seconds, 
         th.avg_operations_per_transaction, th.timed_out_transactions
ORDER BY th.hour_bucket DESC;

-- Problems with traditional transaction error handling:
-- 1. Basic error categorization with limited diagnostic information
-- 2. Manual retry logic without intelligent backoff strategies
-- 3. No automatic recovery based on error type and context
-- 4. Limited visibility into transaction state and progress
-- 5. Basic timeout handling without consideration of operation complexity
-- 6. No integration with connection pool health and server status
-- 7. Manual intervention required for most recovery scenarios
-- 8. Limited support for distributed transaction patterns
-- 9. Basic error aggregation without trend analysis
-- 10. No automatic optimization based on error patterns
```

MongoDB's intelligent transaction error handling eliminates these limitations:

```javascript
// MongoDB advanced transaction error handling - intelligent and resilient
const { MongoClient } = require('mongodb');

// Comprehensive transaction error handling and recovery system
class MongoTransactionManager {
  constructor(client, options = {}) {
    this.client = client;
    this.options = {
      // Retry configuration
      maxRetryAttempts: options.maxRetryAttempts || 5,
      initialRetryDelayMs: options.initialRetryDelayMs || 100,
      maxRetryDelayMs: options.maxRetryDelayMs || 5000,
      retryDelayMultiplier: options.retryDelayMultiplier || 2,
      jitterFactor: options.jitterFactor || 0.1,
      
      // Transaction configuration
      defaultTransactionOptions: {
        readConcern: { level: options.readConcernLevel || 'snapshot' },
        writeConcern: { w: options.writeConcernW || 'majority', j: true },
        readPreference: options.readPreference || 'primary',
        maxCommitTimeMS: options.maxCommitTimeMS || 10000
      },
      
      // Error handling configuration
      retryableErrorCodes: options.retryableErrorCodes || [
        112, // WriteConflict
        117, // ConflictingOperationInProgress  
        133, // FailedToSatisfyReadPreference
        134, // ReadConcernMajorityNotAvailableYet
        208, // ExceededTimeLimit
        225, // LockTimeout
        244, // TransactionTooLarge
        251, // NoSuchTransaction
        256, // TransactionAborted
        261, // ExceededMaxTimeMS
        263, // TemporarilyUnavailable
        6   // HostUnreachable
      ],
      
      // Monitoring configuration
      enableDetailedLogging: options.enableDetailedLogging || true,
      enableMetricsCollection: options.enableMetricsCollection || true
    };
    
    this.transactionMetrics = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      retriedTransactions: 0,
      totalRetryAttempts: 0,
      errorsByCode: new Map(),
      errorsByCategory: new Map(),
      performanceStats: {
        averageTransactionDuration: 0,
        transactionDurations: [],
        retryDelays: [],
        averageRetryDelay: 0
      }
    };
    
    this.activeTransactions = new Map();
  }

  // Execute transaction with comprehensive error handling and retry logic
  async executeTransactionWithRetry(transactionFunction, transactionOptions = {}) {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();
    
    // Merge transaction options
    const mergedOptions = {
      ...this.options.defaultTransactionOptions,
      ...transactionOptions
    };
    
    let attempt = 1;
    let lastError = null;
    let session = null;
    
    // Track active transaction
    this.activeTransactions.set(transactionId, {
      id: transactionId,
      startTime: startTime,
      attempt: attempt,
      status: 'active',
      operationsExecuted: 0,
      errors: []
    });

    try {
      while (attempt <= this.options.maxRetryAttempts) {
        try {
          // Create new session for each attempt
          session = this.client.startSession();
          
          this.log(`Starting transaction ${transactionId}, attempt ${attempt}`);
          
          // Update transaction tracking
          this.updateTransactionStatus(transactionId, 'active', { attempt });
          
          // Execute transaction with intelligent error handling
          const result = await session.withTransaction(
            async (sessionContext) => {
              try {
                // Execute the user-provided transaction function
                const transactionResult = await transactionFunction(sessionContext, {
                  transactionId,
                  attempt,
                  onOperation: (operation) => this.trackOperation(transactionId, operation)
                });
                
                this.log(`Transaction ${transactionId} executed successfully on attempt ${attempt}`);
                return transactionResult;
                
              } catch (error) {
                this.log(`Transaction ${transactionId} error in user function:`, error);
                throw error;
              }
            },
            mergedOptions
          );
          
          // Transaction successful
          const duration = Date.now() - startTime;
          
          this.updateTransactionStatus(transactionId, 'committed', { 
            duration,
            totalAttempts: attempt 
          });
          
          this.recordSuccessfulTransaction(transactionId, duration, attempt);
          
          this.log(`Transaction ${transactionId} committed successfully after ${attempt} attempts (${duration}ms)`);
          
          return {
            success: true,
            result: result,
            transactionId: transactionId,
            attempts: attempt,
            duration: duration,
            metrics: this.getTransactionMetrics(transactionId)
          };
          
        } catch (error) {
          lastError = error;
          
          this.log(`Transaction ${transactionId} attempt ${attempt} failed:`, error);
          
          // Record error for analysis
          this.recordTransactionError(transactionId, error, attempt);
          
          // Analyze error and determine if retry is appropriate
          const errorAnalysis = this.analyzeTransactionError(error);
          
          if (!errorAnalysis.retryable || attempt >= this.options.maxRetryAttempts) {
            // Error is not retryable or max attempts reached
            this.updateTransactionStatus(transactionId, 'failed', { 
              finalError: error,
              totalAttempts: attempt,
              errorAnalysis 
            });
            
            break;
          }
          
          // Calculate intelligent retry delay
          const retryDelay = this.calculateRetryDelay(attempt, errorAnalysis);
          
          this.log(`Transaction ${transactionId} will retry in ${retryDelay}ms (attempt ${attempt + 1}/${this.options.maxRetryAttempts})`);
          
          // Update metrics
          this.transactionMetrics.totalRetryAttempts++;
          this.transactionMetrics.performanceStats.retryDelays.push(retryDelay);
          
          // Wait before retry
          if (retryDelay > 0) {
            await this.sleep(retryDelay);
          }
          
          attempt++;
          
        } finally {
          // Always close session
          if (session) {
            try {
              await session.endSession();
            } catch (sessionError) {
              this.log(`Error ending session for transaction ${transactionId}:`, sessionError);
            }
          }
        }
      }
      
      // All retries exhausted
      const totalDuration = Date.now() - startTime;
      
      this.recordFailedTransaction(transactionId, lastError, attempt - 1, totalDuration);
      
      this.log(`Transaction ${transactionId} failed after ${attempt - 1} attempts (${totalDuration}ms)`);
      
      return {
        success: false,
        error: lastError,
        transactionId: transactionId,
        attempts: attempt - 1,
        duration: totalDuration,
        errorAnalysis: this.analyzeTransactionError(lastError),
        metrics: this.getTransactionMetrics(transactionId),
        recoveryRecommendations: this.generateRecoveryRecommendations(transactionId, lastError)
      };
      
    } finally {
      // Clean up transaction tracking
      this.activeTransactions.delete(transactionId);
    }
  }

  // Intelligent error analysis for MongoDB transactions
  analyzeTransactionError(error) {
    const analysis = {
      errorCode: error.code,
      errorMessage: error.message,
      errorName: error.name,
      retryable: false,
      category: 'unknown',
      severity: 'medium',
      recommendedAction: 'investigate',
      estimatedRecoveryTime: 0,
      contextualInfo: {}
    };
    
    // Categorize error based on code and message
    if (error.code) {
      // Transient errors that should be retried
      if (this.options.retryableErrorCodes.includes(error.code)) {
        analysis.retryable = true;
        analysis.category = this.categorizeMongoError(error.code);
        analysis.severity = 'low';
        analysis.recommendedAction = 'retry';
        analysis.estimatedRecoveryTime = this.estimateRecoveryTime(error.code);
      }
      
      // Specific error code analysis
      switch (error.code) {
        case 112: // WriteConflict
          analysis.category = 'concurrency';
          analysis.recommendedAction = 'retry_with_backoff';
          analysis.contextualInfo.suggestion = 'Consider optimizing transaction scope to reduce conflicts';
          break;
          
        case 117: // ConflictingOperationInProgress
          analysis.category = 'concurrency';
          analysis.recommendedAction = 'retry_with_longer_delay';
          analysis.contextualInfo.suggestion = 'Wait for conflicting operation to complete';
          break;
          
        case 133: // FailedToSatisfyReadPreference
          analysis.category = 'availability';
          analysis.recommendedAction = 'check_replica_set_status';
          analysis.contextualInfo.suggestion = 'Verify replica set member availability';
          break;
          
        case 208: // ExceededTimeLimit
        case 261: // ExceededMaxTimeMS
          analysis.category = 'timeout';
          analysis.recommendedAction = 'optimize_or_increase_timeout';
          analysis.contextualInfo.suggestion = 'Consider breaking transaction into smaller operations';
          break;
          
        case 244: // TransactionTooLarge
          analysis.category = 'resource';
          analysis.retryable = false;
          analysis.severity = 'high';
          analysis.recommendedAction = 'reduce_transaction_size';
          analysis.contextualInfo.suggestion = 'Split transaction into smaller operations';
          break;
          
        case 251: // NoSuchTransaction
          analysis.category = 'state';
          analysis.recommendedAction = 'restart_transaction';
          analysis.contextualInfo.suggestion = 'Transaction may have been cleaned up by server';
          break;
          
        case 256: // TransactionAborted
          analysis.category = 'aborted';
          analysis.recommendedAction = 'retry_full_transaction';
          analysis.contextualInfo.suggestion = 'Transaction was aborted due to conflict or timeout';
          break;
      }
    }
    
    // Network-related errors
    if (error.message && (
      error.message.includes('network') || 
      error.message.includes('connection') ||
      error.message.includes('timeout') ||
      error.message.includes('unreachable')
    )) {
      analysis.retryable = true;
      analysis.category = 'network';
      analysis.recommendedAction = 'retry_with_exponential_backoff';
      analysis.estimatedRecoveryTime = 5000; // 5 seconds
      analysis.contextualInfo.suggestion = 'Check network connectivity and server status';
    }
    
    // Resource exhaustion errors
    if (error.message && (
      error.message.includes('memory') ||
      error.message.includes('disk space') ||
      error.message.includes('too many connections')
    )) {
      analysis.retryable = true;
      analysis.category = 'resource';
      analysis.severity = 'high';
      analysis.recommendedAction = 'wait_for_resources';
      analysis.estimatedRecoveryTime = 10000; // 10 seconds
      analysis.contextualInfo.suggestion = 'Monitor server resource usage';
    }
    
    return analysis;
  }

  categorizeMongoError(errorCode) {
    const errorCategories = {
      112: 'concurrency',    // WriteConflict
      117: 'concurrency',    // ConflictingOperationInProgress
      133: 'availability',   // FailedToSatisfyReadPreference
      134: 'availability',   // ReadConcernMajorityNotAvailableYet
      208: 'timeout',        // ExceededTimeLimit
      225: 'concurrency',    // LockTimeout
      244: 'resource',       // TransactionTooLarge
      251: 'state',          // NoSuchTransaction
      256: 'aborted',        // TransactionAborted
      261: 'timeout',        // ExceededMaxTimeMS
      263: 'availability',   // TemporarilyUnavailable
      6: 'network'           // HostUnreachable
    };
    
    return errorCategories[errorCode] || 'unknown';
  }

  estimateRecoveryTime(errorCode) {
    const recoveryTimes = {
      112: 100,   // WriteConflict - quick retry
      117: 500,   // ConflictingOperationInProgress - wait for operation
      133: 2000,  // FailedToSatisfyReadPreference - wait for replica
      134: 1000,  // ReadConcernMajorityNotAvailableYet - wait for majority
      208: 5000,  // ExceededTimeLimit - wait before retry
      225: 200,   // LockTimeout - quick retry
      251: 100,   // NoSuchTransaction - immediate retry
      256: 300,   // TransactionAborted - short wait
      261: 3000,  // ExceededMaxTimeMS - moderate wait
      263: 1000,  // TemporarilyUnavailable - short wait
      6: 5000     // HostUnreachable - wait for network
    };
    
    return recoveryTimes[errorCode] || 1000;
  }

  // Calculate intelligent retry delay with exponential backoff and jitter
  calculateRetryDelay(attemptNumber, errorAnalysis) {
    // Base delay calculation with exponential backoff
    let baseDelay = Math.min(
      this.options.initialRetryDelayMs * Math.pow(this.options.retryDelayMultiplier, attemptNumber - 1),
      this.options.maxRetryDelayMs
    );
    
    // Adjust based on error analysis
    if (errorAnalysis.estimatedRecoveryTime > 0) {
      baseDelay = Math.max(baseDelay, errorAnalysis.estimatedRecoveryTime);
    }
    
    // Add jitter to prevent thundering herd
    const jitterRange = baseDelay * this.options.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange; // Random value between -jitterRange and +jitterRange
    
    const finalDelay = Math.max(0, Math.floor(baseDelay + jitter));
    
    this.log(`Calculated retry delay: base=${baseDelay}ms, jitter=${jitter.toFixed(1)}ms, final=${finalDelay}ms`);
    
    return finalDelay;
  }

  // Generate recovery recommendations based on error patterns
  generateRecoveryRecommendations(transactionId, error) {
    const recommendations = [];
    const errorAnalysis = this.analyzeTransactionError(error);
    
    // Category-specific recommendations
    switch (errorAnalysis.category) {
      case 'concurrency':
        recommendations.push({
          type: 'optimization',
          priority: 'medium',
          description: 'Optimize transaction scope to reduce write conflicts',
          actions: [
            'Consider breaking large transactions into smaller operations',
            'Review document access patterns for optimization opportunities',
            'Implement optimistic locking where appropriate'
          ]
        });
        break;
        
      case 'timeout':
        recommendations.push({
          type: 'configuration',
          priority: 'high',
          description: 'Address transaction timeout issues',
          actions: [
            'Increase maxCommitTimeMS if operations are legitimately slow',
            'Optimize query performance with proper indexing',
            'Consider breaking complex operations into smaller transactions'
          ]
        });
        break;
        
      case 'resource':
        recommendations.push({
          type: 'scaling',
          priority: 'high',
          description: 'Address resource constraints',
          actions: [
            'Monitor server resource usage (CPU, memory, disk)',
            'Consider vertical or horizontal scaling',
            'Implement connection pooling optimization'
          ]
        });
        break;
        
      case 'network':
        recommendations.push({
          type: 'infrastructure',
          priority: 'high',
          description: 'Address network connectivity issues',
          actions: [
            'Check network connectivity between application and database',
            'Verify MongoDB server status and availability',
            'Consider implementing circuit breaker pattern'
          ]
        });
        break;
        
      case 'availability':
        recommendations.push({
          type: 'deployment',
          priority: 'high',
          description: 'Address replica set availability',
          actions: [
            'Check replica set member status',
            'Verify read preference configuration',
            'Monitor replica lag and catch-up status'
          ]
        });
        break;
    }
    
    // Pattern-based recommendations
    const transactionHistory = this.getTransactionHistory(transactionId);
    if (transactionHistory && transactionHistory.errors.length > 1) {
      // Check for recurring error patterns
      const errorCodes = transactionHistory.errors.map(e => e.code);
      const uniqueErrorCodes = [...new Set(errorCodes)];
      
      if (uniqueErrorCodes.length === 1) {
        recommendations.push({
          type: 'pattern',
          priority: 'high',
          description: 'Recurring error pattern detected',
          actions: [
            `Address root cause of error ${uniqueErrorCodes[0]}`,
            'Consider implementing circuit breaker pattern',
            'Review application architecture for reliability improvements'
          ]
        });
      }
    }
    
    return recommendations;
  }

  // Advanced transaction monitoring and metrics collection
  recordSuccessfulTransaction(transactionId, duration, attempts) {
    this.transactionMetrics.totalTransactions++;
    this.transactionMetrics.successfulTransactions++;
    
    if (attempts > 1) {
      this.transactionMetrics.retriedTransactions++;
    }
    
    // Update performance statistics
    this.transactionMetrics.performanceStats.transactionDurations.push(duration);
    
    // Keep only recent durations for average calculation
    if (this.transactionMetrics.performanceStats.transactionDurations.length > 1000) {
      this.transactionMetrics.performanceStats.transactionDurations = 
        this.transactionMetrics.performanceStats.transactionDurations.slice(-500);
    }
    
    // Recalculate average
    this.transactionMetrics.performanceStats.averageTransactionDuration = 
      this.transactionMetrics.performanceStats.transactionDurations.reduce((sum, d) => sum + d, 0) /
      this.transactionMetrics.performanceStats.transactionDurations.length;
    
    this.log(`Transaction ${transactionId} metrics recorded: duration=${duration}ms, attempts=${attempts}`);
  }

  recordFailedTransaction(transactionId, error, attempts, duration) {
    this.transactionMetrics.totalTransactions++;
    this.transactionMetrics.failedTransactions++;
    
    if (attempts > 1) {
      this.transactionMetrics.retriedTransactions++;
    }
    
    // Record error statistics
    const errorCode = error.code || 'unknown';
    const currentCount = this.transactionMetrics.errorsByCode.get(errorCode) || 0;
    this.transactionMetrics.errorsByCode.set(errorCode, currentCount + 1);
    
    const errorCategory = this.categorizeMongoError(error.code);
    const currentCategoryCount = this.transactionMetrics.errorsByCategory.get(errorCategory) || 0;
    this.transactionMetrics.errorsByCategory.set(errorCategory, currentCategoryCount + 1);
    
    this.log(`Transaction ${transactionId} failure recorded: error=${errorCode}, attempts=${attempts}, duration=${duration}ms`);
  }

  recordTransactionError(transactionId, error, attempt) {
    const transaction = this.activeTransactions.get(transactionId);
    if (transaction) {
      transaction.errors.push({
        attempt: attempt,
        error: error,
        timestamp: new Date(),
        errorCode: error.code,
        errorMessage: error.message,
        analysis: this.analyzeTransactionError(error)
      });
    }
  }

  updateTransactionStatus(transactionId, status, additionalInfo = {}) {
    const transaction = this.activeTransactions.get(transactionId);
    if (transaction) {
      transaction.status = status;
      transaction.lastUpdated = new Date();
      Object.assign(transaction, additionalInfo);
    }
  }

  trackOperation(transactionId, operation) {
    const transaction = this.activeTransactions.get(transactionId);
    if (transaction) {
      transaction.operationsExecuted++;
      transaction.lastOperation = {
        type: operation.type,
        collection: operation.collection,
        timestamp: new Date()
      };
    }
  }

  getTransactionMetrics(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    return {
      transactionId: transactionId,
      operationsExecuted: transaction ? transaction.operationsExecuted : 0,
      errors: transaction ? transaction.errors : [],
      status: transaction ? transaction.status : 'unknown',
      startTime: transaction ? transaction.startTime : null,
      duration: transaction ? Date.now() - transaction.startTime : 0
    };
  }

  getTransactionHistory(transactionId) {
    return this.activeTransactions.get(transactionId);
  }

  // Comprehensive transaction health monitoring
  getTransactionHealthReport() {
    const report = {
      timestamp: new Date(),
      overall: {
        totalTransactions: this.transactionMetrics.totalTransactions,
        successfulTransactions: this.transactionMetrics.successfulTransactions,
        failedTransactions: this.transactionMetrics.failedTransactions,
        retriedTransactions: this.transactionMetrics.retriedTransactions,
        totalRetryAttempts: this.transactionMetrics.totalRetryAttempts,
        successRate: this.transactionMetrics.totalTransactions > 0 ? 
          (this.transactionMetrics.successfulTransactions / this.transactionMetrics.totalTransactions) * 100 : 0,
        retryRate: this.transactionMetrics.totalTransactions > 0 ?
          (this.transactionMetrics.retriedTransactions / this.transactionMetrics.totalTransactions) * 100 : 0
      },
      performance: {
        averageTransactionDuration: this.transactionMetrics.performanceStats.averageTransactionDuration,
        averageRetryDelay: this.transactionMetrics.performanceStats.retryDelays.length > 0 ?
          this.transactionMetrics.performanceStats.retryDelays.reduce((sum, d) => sum + d, 0) /
          this.transactionMetrics.performanceStats.retryDelays.length : 0,
        totalRecentTransactions: this.transactionMetrics.performanceStats.transactionDurations.length
      },
      errors: {
        byCode: Object.fromEntries(this.transactionMetrics.errorsByCode),
        byCategory: Object.fromEntries(this.transactionMetrics.errorsByCategory),
        mostCommonError: this.getMostCommonError(),
        mostCommonCategory: this.getMostCommonErrorCategory()
      },
      activeTransactions: {
        count: this.activeTransactions.size,
        transactions: Array.from(this.activeTransactions.values()).map(t => ({
          id: t.id,
          status: t.status,
          duration: Date.now() - t.startTime,
          attempts: t.attempt,
          operationsExecuted: t.operationsExecuted,
          errorCount: t.errors ? t.errors.length : 0
        }))
      }
    };
    
    return report;
  }

  getMostCommonError() {
    let maxCount = 0;
    let mostCommonError = null;
    
    for (const [errorCode, count] of this.transactionMetrics.errorsByCode.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonError = { code: errorCode, count: count };
      }
    }
    
    return mostCommonError;
  }

  getMostCommonErrorCategory() {
    let maxCount = 0;
    let mostCommonCategory = null;
    
    for (const [category, count] of this.transactionMetrics.errorsByCategory.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonCategory = { category: category, count: count };
      }
    }
    
    return mostCommonCategory;
  }

  // Utility methods
  generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(message, error = null) {
    if (this.options.enableDetailedLogging) {
      const timestamp = new Date().toISOString();
      if (error) {
        console.log(`[${timestamp}] ${message}`, error);
      } else {
        console.log(`[${timestamp}] ${message}`);
      }
    }
  }
}

// Example usage with comprehensive error handling
async function demonstrateTransactionErrorHandling() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  const transactionManager = new MongoTransactionManager(client, {
    maxRetryAttempts: 3,
    initialRetryDelayMs: 100,
    maxRetryDelayMs: 5000,
    enableDetailedLogging: true,
    enableMetricsCollection: true
  });
  
  try {
    // Example transaction with comprehensive error handling
    const result = await transactionManager.executeTransactionWithRetry(
      async (session, context) => {
        const { transactionId, attempt } = context;
        
        console.log(`Executing business logic for transaction ${transactionId}, attempt ${attempt}`);
        
        const db = client.db('ecommerce');
        const ordersCollection = db.collection('orders');
        const inventoryCollection = db.collection('inventory');
        const accountsCollection = db.collection('accounts');
        
        // Track operations for monitoring
        context.onOperation({ type: 'insert', collection: 'orders' });
        context.onOperation({ type: 'update', collection: 'inventory' });
        context.onOperation({ type: 'update', collection: 'accounts' });
        
        // Complex business transaction
        const order = {
          orderId: `order_${Date.now()}`,
          customerId: 'customer_123',
          items: [
            { productId: 'prod_456', quantity: 2, price: 29.99 },
            { productId: 'prod_789', quantity: 1, price: 49.99 }
          ],
          totalAmount: 109.97,
          status: 'pending',
          createdAt: new Date()
        };
        
        // Insert order
        const orderResult = await ordersCollection.insertOne(order, { session });
        
        // Update inventory
        for (const item of order.items) {
          const inventoryUpdate = await inventoryCollection.updateOne(
            { productId: item.productId, quantity: { $gte: item.quantity } },
            { $inc: { quantity: -item.quantity } },
            { session }
          );
          
          if (inventoryUpdate.modifiedCount === 0) {
            throw new Error(`Insufficient inventory for product ${item.productId}`);
          }
        }
        
        // Update customer account
        await accountsCollection.updateOne(
          { customerId: order.customerId },
          { 
            $inc: { totalOrders: 1, totalSpent: order.totalAmount },
            $set: { lastOrderDate: new Date() }
          },
          { session }
        );
        
        return {
          orderId: order.orderId,
          orderResult: orderResult,
          message: 'Order processed successfully'
        };
      },
      {
        // Custom transaction options
        maxCommitTimeMS: 15000,
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true }
      }
    );
    
    if (result.success) {
      console.log('Transaction completed successfully:', result);
    } else {
      console.error('Transaction failed after all retries:', result);
    }
    
    // Get comprehensive health report
    const healthReport = transactionManager.getTransactionHealthReport();
    console.log('Transaction Health Report:', JSON.stringify(healthReport, null, 2));
    
  } catch (error) {
    console.error('Unexpected error:', error);
  } finally {
    await client.close();
  }
}

// Benefits of MongoDB intelligent transaction error handling:
// - Automatic retry logic with exponential backoff and jitter
// - Intelligent error classification and recovery recommendations
// - Comprehensive transaction state tracking and monitoring
// - Advanced performance metrics and health reporting
// - Context-aware error analysis and recovery strategies
// - Built-in support for MongoDB-specific error patterns
// - Detailed logging and diagnostic information
// - Integration with MongoDB driver optimization features
// - Automatic detection of retryable vs. non-retryable errors
// - Production-ready resilience and reliability patterns
```

## Advanced Error Recovery Patterns

Sophisticated recovery strategies for production-grade MongoDB applications:

```javascript
// Advanced MongoDB error recovery patterns for enterprise resilience
class MongoResilienceManager {
  constructor(client, options = {}) {
    this.client = client;
    this.transactionManager = new MongoTransactionManager(client, options);
    
    this.recoveryStrategies = new Map();
    this.circuitBreakers = new Map();
    this.healthCheckers = new Map();
    
    this.options = {
      // Circuit breaker configuration
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: options.circuitBreakerTimeout || 60000,
      circuitBreakerVolumeThreshold: options.circuitBreakerVolumeThreshold || 10,
      
      // Health check configuration
      healthCheckInterval: options.healthCheckInterval || 30000,
      healthCheckTimeout: options.healthCheckTimeout || 5000,
      
      // Recovery configuration
      enableAutomaticRecovery: options.enableAutomaticRecovery || true,
      maxRecoveryAttempts: options.maxRecoveryAttempts || 3
    };
    
    this.initialize();
  }

  initialize() {
    // Set up circuit breakers for different operation types
    this.setupCircuitBreakers();
    
    // Initialize health monitoring
    this.startHealthMonitoring();
    
    // Register recovery strategies
    this.registerRecoveryStrategies();
  }

  setupCircuitBreakers() {
    const operationTypes = ['transaction', 'query', 'update', 'insert', 'delete'];
    
    operationTypes.forEach(opType => {
      this.circuitBreakers.set(opType, {
        state: 'closed', // closed, open, half-open
        failureCount: 0,
        lastFailureTime: null,
        successCount: 0,
        totalRequests: 0,
        threshold: this.options.circuitBreakerThreshold,
        timeout: this.options.circuitBreakerTimeout,
        volumeThreshold: this.options.circuitBreakerVolumeThreshold
      });
    });
  }

  // Execute operation with circuit breaker protection
  async executeWithCircuitBreaker(operationType, operation) {
    const circuitBreaker = this.circuitBreakers.get(operationType);
    
    if (!circuitBreaker) {
      throw new Error(`No circuit breaker configured for operation type: ${operationType}`);
    }
    
    // Check circuit breaker state
    const canExecute = this.checkCircuitBreaker(circuitBreaker);
    
    if (!canExecute) {
      throw new Error(`Circuit breaker is OPEN for ${operationType}. Service temporarily unavailable.`);
    }
    
    try {
      // Execute operation
      const result = await operation();
      
      // Record success
      this.recordCircuitBreakerSuccess(circuitBreaker);
      
      return result;
      
    } catch (error) {
      // Record failure
      this.recordCircuitBreakerFailure(circuitBreaker);
      
      throw error;
    }
  }

  checkCircuitBreaker(circuitBreaker) {
    const now = Date.now();
    
    switch (circuitBreaker.state) {
      case 'closed':
        return true;
        
      case 'open':
        // Check if timeout has elapsed
        if (now - circuitBreaker.lastFailureTime >= circuitBreaker.timeout) {
          circuitBreaker.state = 'half-open';
          return true;
        }
        return false;
        
      case 'half-open':
        return true;
        
      default:
        return false;
    }
  }

  recordCircuitBreakerSuccess(circuitBreaker) {
    circuitBreaker.successCount++;
    circuitBreaker.totalRequests++;
    
    if (circuitBreaker.state === 'half-open') {
      // Reset circuit breaker on successful half-open request
      circuitBreaker.state = 'closed';
      circuitBreaker.failureCount = 0;
    }
  }

  recordCircuitBreakerFailure(circuitBreaker) {
    circuitBreaker.failureCount++;
    circuitBreaker.totalRequests++;
    circuitBreaker.lastFailureTime = Date.now();
    
    // Check if should open circuit
    if (circuitBreaker.totalRequests >= circuitBreaker.volumeThreshold &&
        circuitBreaker.failureCount >= circuitBreaker.threshold) {
      circuitBreaker.state = 'open';
      console.log(`Circuit breaker opened due to ${circuitBreaker.failureCount} failures`);
    }
  }

  // Comprehensive transaction execution with full resilience features
  async executeResilientTransaction(transactionFunction, options = {}) {
    const operationType = 'transaction';
    
    return await this.executeWithCircuitBreaker(operationType, async () => {
      // Execute transaction with comprehensive error handling
      const result = await this.transactionManager.executeTransactionWithRetry(
        transactionFunction,
        options
      );
      
      // If transaction failed, attempt recovery if enabled
      if (!result.success && this.options.enableAutomaticRecovery) {
        const recoveryResult = await this.attemptTransactionRecovery(result);
        if (recoveryResult && recoveryResult.success) {
          return recoveryResult;
        }
      }
      
      return result;
    });
  }

  // Intelligent transaction recovery based on error patterns
  async attemptTransactionRecovery(failedResult) {
    const { error, transactionId, attempts, errorAnalysis } = failedResult;
    
    console.log(`Attempting recovery for failed transaction ${transactionId}`);
    
    // Get appropriate recovery strategy
    const recoveryStrategy = this.getRecoveryStrategy(errorAnalysis);
    
    if (!recoveryStrategy) {
      console.log(`No recovery strategy available for error category: ${errorAnalysis.category}`);
      return null;
    }
    
    try {
      const recoveryResult = await recoveryStrategy.execute(failedResult);
      
      console.log(`Recovery attempt completed for transaction ${transactionId}:`, recoveryResult);
      
      return recoveryResult;
      
    } catch (recoveryError) {
      console.error(`Recovery failed for transaction ${transactionId}:`, recoveryError);
      return null;
    }
  }

  registerRecoveryStrategies() {
    // Network connectivity recovery
    this.recoveryStrategies.set('network', {
      execute: async (failedResult) => {
        console.log('Executing network recovery strategy');
        
        // Wait for network to recover
        await this.waitForNetworkRecovery();
        
        // Check server connectivity
        const healthOk = await this.performHealthCheck();
        
        if (healthOk) {
          console.log('Network recovery successful, retrying transaction');
          // Could retry the transaction here if the original function is available
          return { success: true, recovered: true, strategy: 'network' };
        }
        
        return { success: false, recovered: false, strategy: 'network' };
      }
    });
    
    // Resource recovery
    this.recoveryStrategies.set('resource', {
      execute: async (failedResult) => {
        console.log('Executing resource recovery strategy');
        
        // Wait for resources to become available
        await this.waitForResourceAvailability();
        
        // Check resource status
        const resourcesOk = await this.checkResourceStatus();
        
        if (resourcesOk) {
          console.log('Resource recovery successful');
          return { success: true, recovered: true, strategy: 'resource' };
        }
        
        return { success: false, recovered: false, strategy: 'resource' };
      }
    });
    
    // Availability recovery (replica set issues)
    this.recoveryStrategies.set('availability', {
      execute: async (failedResult) => {
        console.log('Executing availability recovery strategy');
        
        // Check replica set status
        const replicaSetOk = await this.checkReplicaSetHealth();
        
        if (replicaSetOk) {
          console.log('Availability recovery successful');
          return { success: true, recovered: true, strategy: 'availability' };
        }
        
        // Wait for replica set to recover
        await this.waitForReplicaSetRecovery();
        
        const recoveredReplicaSetOk = await this.checkReplicaSetHealth();
        
        return {
          success: recoveredReplicaSetOk,
          recovered: recoveredReplicaSetOk,
          strategy: 'availability'
        };
      }
    });
  }

  getRecoveryStrategy(errorAnalysis) {
    return this.recoveryStrategies.get(errorAnalysis.category);
  }

  // Health monitoring and recovery assistance
  startHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.performComprehensiveHealthCheck();
      } catch (error) {
        console.error('Health monitoring error:', error);
      }
    }, this.options.healthCheckInterval);
  }

  async performComprehensiveHealthCheck() {
    const healthStatus = {
      timestamp: new Date(),
      overall: 'unknown',
      components: {}
    };
    
    try {
      // Check basic connectivity
      healthStatus.components.connectivity = await this.checkConnectivity();
      
      // Check replica set status
      healthStatus.components.replicaSet = await this.checkReplicaSetHealth();
      
      // Check resource status
      healthStatus.components.resources = await this.checkResourceStatus();
      
      // Check circuit breaker status
      healthStatus.components.circuitBreakers = this.getCircuitBreakerStatus();
      
      // Check transaction manager health
      healthStatus.components.transactionManager = this.transactionManager.getTransactionHealthReport();
      
      // Determine overall health
      const componentStatuses = Object.values(healthStatus.components);
      const healthyComponents = componentStatuses.filter(status => 
        status === true || (typeof status === 'object' && status.healthy !== false)
      );
      
      if (healthyComponents.length === componentStatuses.length) {
        healthStatus.overall = 'healthy';
      } else if (healthyComponents.length >= componentStatuses.length * 0.7) {
        healthStatus.overall = 'degraded';
      } else {
        healthStatus.overall = 'unhealthy';
      }
      
      // Store health status
      this.lastHealthStatus = healthStatus;
      
      return healthStatus;
      
    } catch (error) {
      healthStatus.overall = 'error';
      healthStatus.error = error.message;
      return healthStatus;
    }
  }

  async checkConnectivity() {
    try {
      const admin = this.client.db('admin');
      await admin.command({ ping: 1 }, { maxTimeMS: this.options.healthCheckTimeout });
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkReplicaSetHealth() {
    try {
      const admin = this.client.db('admin');
      const status = await admin.command({ replSetGetStatus: 1 });
      
      // Check if majority of members are healthy
      const healthyMembers = status.members.filter(member => 
        member.health === 1 && ['PRIMARY', 'SECONDARY'].includes(member.stateStr)
      );
      
      return {
        healthy: healthyMembers.length >= Math.ceil(status.members.length / 2),
        totalMembers: status.members.length,
        healthyMembers: healthyMembers.length,
        primaryAvailable: status.members.some(m => m.stateStr === 'PRIMARY')
      };
      
    } catch (error) {
      // Might not be a replica set or insufficient privileges
      return { healthy: true, note: 'Replica set status unavailable' };
    }
  }

  async checkResourceStatus() {
    try {
      const admin = this.client.db('admin');
      const serverStatus = await admin.command({ serverStatus: 1 });
      
      const memUsage = serverStatus.mem.resident / serverStatus.mem.virtual;
      const connectionUsage = serverStatus.connections.current / serverStatus.connections.available;
      
      return {
        healthy: memUsage < 0.9 && connectionUsage < 0.9,
        memoryUsage: memUsage,
        connectionUsage: connectionUsage,
        connections: serverStatus.connections,
        memory: serverStatus.mem
      };
      
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  getCircuitBreakerStatus() {
    const status = {};
    
    for (const [opType, breaker] of this.circuitBreakers.entries()) {
      status[opType] = {
        state: breaker.state,
        failureCount: breaker.failureCount,
        successCount: breaker.successCount,
        totalRequests: breaker.totalRequests,
        failureRate: breaker.totalRequests > 0 ? 
          (breaker.failureCount / breaker.totalRequests) * 100 : 0
      };
    }
    
    return status;
  }

  // Recovery assistance methods
  async waitForNetworkRecovery() {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000;  // 1 second
    let waited = 0;
    
    while (waited < maxWaitTime) {
      try {
        const connected = await this.checkConnectivity();
        if (connected) {
          return true;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await this.sleep(checkInterval);
      waited += checkInterval;
    }
    
    return false;
  }

  async waitForResourceAvailability() {
    const maxWaitTime = 60000; // 60 seconds
    const checkInterval = 5000;  // 5 seconds
    let waited = 0;
    
    while (waited < maxWaitTime) {
      try {
        const resourceStatus = await this.checkResourceStatus();
        if (resourceStatus.healthy) {
          return true;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await this.sleep(checkInterval);
      waited += checkInterval;
    }
    
    return false;
  }

  async waitForReplicaSetRecovery() {
    const maxWaitTime = 120000; // 2 minutes
    const checkInterval = 10000;  // 10 seconds
    let waited = 0;
    
    while (waited < maxWaitTime) {
      try {
        const replicaStatus = await this.checkReplicaSetHealth();
        if (replicaStatus.healthy) {
          return true;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await this.sleep(checkInterval);
      waited += checkInterval;
    }
    
    return false;
  }

  async performHealthCheck() {
    const health = await this.performComprehensiveHealthCheck();
    return health.overall === 'healthy' || health.overall === 'degraded';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get comprehensive resilience report
  getResilienceReport() {
    return {
      timestamp: new Date(),
      circuitBreakers: this.getCircuitBreakerStatus(),
      transactionHealth: this.transactionManager.getTransactionHealthReport(),
      lastHealthCheck: this.lastHealthStatus,
      recoveryStrategies: Array.from(this.recoveryStrategies.keys()),
      configuration: {
        circuitBreakerThreshold: this.options.circuitBreakerThreshold,
        circuitBreakerTimeout: this.options.circuitBreakerTimeout,
        healthCheckInterval: this.options.healthCheckInterval,
        automaticRecoveryEnabled: this.options.enableAutomaticRecovery
      }
    };
  }
}
```

## SQL-Style Error Handling with QueryLeaf

QueryLeaf provides familiar approaches to MongoDB transaction error handling and monitoring:

```sql
-- QueryLeaf transaction error handling with SQL-familiar syntax

-- Monitor transaction error patterns
SELECT 
  DATE_TRUNC('hour', error_timestamp) as hour_bucket,
  error_category,
  error_code,
  
  -- Error statistics
  COUNT(*) as error_count,
  COUNT(DISTINCT transaction_id) as affected_transactions,
  AVG(retry_attempts) as avg_retry_attempts,
  COUNT(CASE WHEN recovery_successful = true THEN 1 END) as successful_recoveries,
  
  -- Performance impact
  AVG(transaction_duration_ms) as avg_failed_transaction_duration,
  AVG(time_to_failure_ms) as avg_time_to_failure,
  
  -- Recovery metrics
  AVG(recovery_time_ms) as avg_recovery_time,
  MAX(recovery_time_ms) as max_recovery_time,
  
  -- Success rates
  ROUND((COUNT(CASE WHEN recovery_successful = true THEN 1 END)::DECIMAL / COUNT(*)) * 100, 2) as recovery_success_rate

FROM TRANSACTION_ERROR_LOG()
WHERE error_timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', error_timestamp), error_category, error_code
ORDER BY hour_bucket DESC, error_count DESC;

-- Analyze transaction resilience patterns
WITH transaction_resilience AS (
  SELECT 
    transaction_id,
    transaction_type,
    
    -- Transaction characteristics
    operation_count,
    total_duration_ms,
    retry_attempts,
    
    -- Error analysis
    first_error_code,
    first_error_category,
    total_errors,
    
    -- Recovery analysis
    recovery_strategy_used,
    recovery_successful,
    recovery_duration_ms,
    
    -- Final outcome
    final_status, -- committed, failed, recovered
    
    -- Timing analysis
    created_at,
    completed_at
    
  FROM TRANSACTION_HISTORY()
  WHERE created_at >= NOW() - INTERVAL '7 days'
),

resilience_patterns AS (
  SELECT 
    transaction_type,
    first_error_category,
    
    -- Volume metrics
    COUNT(*) as transaction_count,
    COUNT(CASE WHEN final_status = 'committed' THEN 1 END) as successful_transactions,
    COUNT(CASE WHEN final_status = 'recovered' THEN 1 END) as recovered_transactions,
    COUNT(CASE WHEN final_status = 'failed' THEN 1 END) as failed_transactions,
    
    -- Retry analysis
    AVG(retry_attempts) as avg_retry_attempts,
    MAX(retry_attempts) as max_retry_attempts,
    COUNT(CASE WHEN retry_attempts > 0 THEN 1 END) as transactions_with_retries,
    
    -- Recovery analysis
    COUNT(CASE WHEN recovery_strategy_used IS NOT NULL THEN 1 END) as recovery_attempts,
    COUNT(CASE WHEN recovery_successful = true THEN 1 END) as successful_recoveries,
    AVG(recovery_duration_ms) as avg_recovery_duration,
    
    -- Performance metrics
    AVG(total_duration_ms) as avg_total_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_duration_ms) as p95_duration,
    
    -- Success rates
    ROUND((COUNT(CASE WHEN final_status IN ('committed', 'recovered') THEN 1 END)::DECIMAL / COUNT(*)) * 100, 2) as overall_success_rate,
    ROUND((COUNT(CASE WHEN recovery_successful = true THEN 1 END)::DECIMAL / 
           GREATEST(COUNT(CASE WHEN recovery_strategy_used IS NOT NULL THEN 1 END), 1)) * 100, 2) as recovery_success_rate
    
  FROM transaction_resilience
  GROUP BY transaction_type, first_error_category
)

SELECT 
  transaction_type,
  first_error_category,
  
  -- Volume and success metrics
  transaction_count,
  successful_transactions,
  recovered_transactions,
  failed_transactions,
  overall_success_rate,
  
  -- Retry patterns
  avg_retry_attempts,
  max_retry_attempts,
  ROUND((transactions_with_retries::DECIMAL / transaction_count) * 100, 2) as retry_rate_percent,
  
  -- Recovery effectiveness
  recovery_attempts,
  successful_recoveries,
  recovery_success_rate,
  avg_recovery_duration,
  
  -- Performance characteristics
  avg_total_duration,
  p95_duration,
  
  -- Health assessment
  CASE 
    WHEN overall_success_rate >= 99 THEN 'Excellent'
    WHEN overall_success_rate >= 95 THEN 'Good' 
    WHEN overall_success_rate >= 90 THEN 'Fair'
    ELSE 'Poor'
  END as resilience_grade,
  
  -- Recommendations
  CASE 
    WHEN recovery_success_rate < 50 AND recovery_attempts > 0 THEN 'Improve recovery strategies'
    WHEN avg_retry_attempts > 3 THEN 'Review retry configuration'
    WHEN failed_transactions > successful_transactions * 0.1 THEN 'Investigate error root causes'
    ELSE 'Performance acceptable'
  END as recommendation

FROM resilience_patterns
ORDER BY transaction_count DESC, overall_success_rate ASC;

-- Real-time transaction health monitoring
SELECT 
  -- Current status
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_transactions,
  COUNT(CASE WHEN status = 'retrying' THEN 1 END) as retrying_transactions,
  COUNT(CASE WHEN status = 'recovering' THEN 1 END) as recovering_transactions,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
  
  -- Recent performance (last 5 minutes)
  AVG(CASE WHEN completed_at >= NOW() - INTERVAL '5 minutes' 
           THEN duration_ms END) as recent_avg_duration_ms,
  COUNT(CASE WHEN completed_at >= NOW() - INTERVAL '5 minutes' 
             AND final_status = 'committed' THEN 1 END) as recent_successful_transactions,
  COUNT(CASE WHEN completed_at >= NOW() - INTERVAL '5 minutes' 
             AND final_status = 'failed' THEN 1 END) as recent_failed_transactions,
  
  -- Error rates
  ROUND((COUNT(CASE WHEN error_occurred_at >= NOW() - INTERVAL '5 minutes' THEN 1 END)::DECIMAL /
         GREATEST(COUNT(CASE WHEN created_at >= NOW() - INTERVAL '5 minutes' THEN 1 END), 1)) * 100, 2) 
         as recent_error_rate_percent,
  
  -- Circuit breaker status
  COUNT(CASE WHEN circuit_breaker_state = 'open' THEN 1 END) as open_circuit_breakers,
  COUNT(CASE WHEN circuit_breaker_state = 'half-open' THEN 1 END) as half_open_circuit_breakers,
  
  -- Recovery metrics
  COUNT(CASE WHEN recovery_in_progress = true THEN 1 END) as active_recoveries,
  AVG(CASE WHEN recovery_completed_at >= NOW() - INTERVAL '5 minutes' 
           THEN recovery_duration_ms END) as recent_avg_recovery_time_ms,
  
  -- Health indicators
  CASE 
    WHEN COUNT(CASE WHEN status = 'failed' THEN 1 END) > 
         COUNT(CASE WHEN status = 'active' THEN 1 END) * 0.5 THEN 'Critical'
    WHEN COUNT(CASE WHEN circuit_breaker_state = 'open' THEN 1 END) > 0 THEN 'Degraded'
    WHEN COUNT(CASE WHEN status = 'retrying' THEN 1 END) > 
         COUNT(CASE WHEN status = 'active' THEN 1 END) * 0.3 THEN 'Warning'
    ELSE 'Healthy'
  END as overall_health_status,
  
  NOW() as report_timestamp

FROM ACTIVE_TRANSACTION_STATUS()
CROSS JOIN CIRCUIT_BREAKER_STATUS()
CROSS JOIN RECOVERY_STATUS();

-- Transaction error prevention and optimization
CREATE ALERT TRANSACTION_ERROR_PREVENTION
ON TRANSACTION_ERROR_LOG()
WHEN (
  -- High error rate
  (SELECT COUNT(*) FROM TRANSACTION_ERROR_LOG() 
   WHERE error_timestamp >= NOW() - INTERVAL '5 minutes') > 10
  OR
  -- Circuit breaker opened
  (SELECT COUNT(*) FROM CIRCUIT_BREAKER_STATUS() 
   WHERE state = 'open') > 0
  OR
  -- Recovery failing
  (SELECT AVG(CASE WHEN recovery_successful = true THEN 1.0 ELSE 0.0 END) 
   FROM TRANSACTION_ERROR_LOG() 
   WHERE error_timestamp >= NOW() - INTERVAL '15 minutes' 
   AND recovery_strategy_used IS NOT NULL) < 0.5
)
NOTIFY ['dba-team@company.com', 'dev-team@company.com']
WITH MESSAGE TEMPLATE '''
{% raw %}
Transaction Error Alert

Current Status:
- Recent Errors (5 min): {{ recent_error_count }}
- Open Circuit Breakers: {{ open_circuit_breaker_count }}
- Active Recoveries: {{ active_recovery_count }}
- Recovery Success Rate: {{ recovery_success_rate }}%

Top Error Categories:
{{ top_error_categories }}

Recommended Actions:
{{ error_prevention_recommendations }}

Dashboard: https://monitoring.company.com/mongodb/transactions
{% endraw %}
'''
EVERY 1 MINUTES;

-- QueryLeaf transaction error handling provides:
-- 1. SQL-familiar error monitoring and analysis
-- 2. Comprehensive transaction resilience reporting
-- 3. Real-time health monitoring and alerting
-- 4. Intelligent error pattern detection
-- 5. Recovery strategy effectiveness analysis
-- 6. Circuit breaker status monitoring
-- 7. Performance impact assessment
-- 8. Automated prevention and optimization recommendations
-- 9. Integration with MongoDB's native error handling
-- 10. Production-ready operational visibility
```

## Best Practices for MongoDB Transaction Error Handling

### Error Classification Strategy

Optimal error handling configuration for different application patterns:

1. **High-Frequency Applications**: Aggressive retry policies with intelligent backoff
2. **Mission-Critical Systems**: Comprehensive recovery strategies with circuit breakers
3. **Batch Processing**: Extended timeout configurations with resource monitoring
4. **Real-time Applications**: Fast-fail approaches with immediate fallback mechanisms
5. **Microservices**: Distributed error handling with service-level circuit breakers
6. **Analytics Workloads**: Specialized error handling for long-running operations

### Recovery Strategy Guidelines

Essential patterns for production transaction recovery:

1. **Automatic Retry Logic**: Exponential backoff with jitter for transient failures
2. **Circuit Breaker Pattern**: Prevent cascading failures with intelligent state management
3. **Health Monitoring**: Continuous assessment of system and transaction health
4. **Recovery Automation**: Context-aware recovery strategies for different error types
5. **Performance Monitoring**: Track error impact on application performance
6. **Operational Alerting**: Proactive notification of error patterns and recovery issues

## Conclusion

MongoDB transaction error handling and recovery requires sophisticated strategies that balance reliability, performance, and operational complexity. By implementing intelligent retry mechanisms, comprehensive error classification, and automated recovery patterns, applications can maintain consistency and reliability even when facing distributed system challenges.

Key error handling benefits include:

- **Intelligent Recovery**: Automatic retry logic with context-aware recovery strategies
- **Comprehensive Monitoring**: Detailed error tracking and performance analysis
- **Circuit Breaker Protection**: Prevention of cascading failures with intelligent state management
- **Health Assessment**: Continuous monitoring of transaction and system health
- **Operational Visibility**: Real-time insights into error patterns and recovery effectiveness
- **Production Resilience**: Enterprise-grade reliability patterns for mission-critical applications

Whether you're building high-throughput web applications, distributed microservices, data processing pipelines, or real-time analytics platforms, MongoDB's intelligent transaction error handling with QueryLeaf's familiar management interface provides the foundation for resilient, reliable database operations. This combination enables you to leverage advanced error recovery capabilities while maintaining familiar database administration patterns and operational procedures.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-familiar error handling patterns into optimal MongoDB transaction configurations while providing comprehensive monitoring and recovery through SQL-style queries. Advanced error classification, recovery automation, and performance analysis are seamlessly managed through familiar database administration interfaces, making sophisticated error handling both powerful and accessible.

The integration of intelligent error handling with SQL-style database operations makes MongoDB an ideal platform for applications requiring both high reliability and familiar error management patterns, ensuring your transactions remain both consistent and resilient as they scale to meet demanding production requirements.