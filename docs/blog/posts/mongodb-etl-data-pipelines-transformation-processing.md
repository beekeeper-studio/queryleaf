---
title: "MongoDB ETL and Data Pipeline Processing: High-Performance Data Transformation and Stream Processing with SQL-Familiar Pipeline Architecture"
description: "Master MongoDB ETL and data pipeline patterns for real-time data transformation, batch processing, and stream analytics. Learn SQL-style data processing with MongoDB aggregation pipelines for enterprise data workflows."
date: 2025-01-01
tags: [mongodb, etl, data-pipelines, aggregation, data-transformation, stream-processing, sql]
---

# MongoDB ETL and Data Pipeline Processing: High-Performance Data Transformation and Stream Processing with SQL-Familiar Pipeline Architecture

Modern data-driven organizations require sophisticated ETL (Extract, Transform, Load) processes that can handle diverse data sources, perform complex transformations, and deliver processed data to multiple downstream systems in real-time. Traditional ETL tools often struggle with the volume, variety, and velocity requirements of contemporary data workflows, particularly when dealing with semi-structured data, real-time streaming sources, and the need for flexible schema evolution.

MongoDB's aggregation framework, combined with change streams and flexible document storage, provides a powerful foundation for building high-performance ETL pipelines that can process data at scale while maintaining the familiar SQL-style operations that development teams understand. This approach enables efficient data transformation, real-time processing capabilities, and seamless integration with existing data infrastructure.

## The Traditional ETL Challenge

Conventional ETL architectures face significant limitations when dealing with modern data requirements:

```sql
-- Traditional PostgreSQL ETL limitations
-- Fixed schema constraints limit data source flexibility

CREATE TABLE raw_customer_data (
    customer_id BIGINT PRIMARY KEY,
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    registration_date DATE,
    
    -- Static schema can't accommodate varying data structures
    profile_data JSONB  -- Limited JSON support
);

-- Complex transformation logic requires stored procedures
CREATE OR REPLACE FUNCTION transform_customer_data()
RETURNS TABLE(
    customer_key BIGINT,
    full_name VARCHAR(201),
    email_domain VARCHAR(100),
    registration_month VARCHAR(7),
    profile_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.customer_id,
        CONCAT(c.first_name, ' ', c.last_name),
        SUBSTRING(c.email FROM POSITION('@' IN c.email) + 1),
        TO_CHAR(c.registration_date, 'YYYY-MM'),
        CASE 
            WHEN c.profile_data->>'premium' = 'true' THEN 100
            WHEN c.profile_data->>'verified' = 'true' THEN 50
            ELSE 25
        END
    FROM raw_customer_data c
    WHERE c.registration_date >= CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Batch processing limitations
INSERT INTO transformed_customers 
SELECT * FROM transform_customer_data();

-- Problems:
-- 1. Rigid schema requirements
-- 2. Limited real-time processing
-- 3. Complex stored procedure logic
-- 4. Poor scaling for large datasets
-- 5. Limited support for nested/complex data structures
```

MongoDB ETL pipelines address these limitations with flexible aggregation-based transformations:

```javascript
// MongoDB flexible ETL pipeline
const customerTransformPipeline = [
  // Extract: Flexible data ingestion from multiple sources
  {
    $match: {
      registration_date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      status: { $ne: "deleted" }
    }
  },
  
  // Transform: Complex data transformation with aggregation operators
  {
    $addFields: {
      full_name: { $concat: ["$first_name", " ", "$last_name"] },
      email_domain: {
        $substr: [
          "$email",
          { $add: [{ $indexOfBytes: ["$email", "@"] }, 1] },
          { $strLenCP: "$email" }
        ]
      },
      registration_month: {
        $dateToString: { format: "%Y-%m", date: "$registration_date" }
      },
      profile_score: {
        $switch: {
          branches: [
            { case: { $eq: ["$profile.premium", true] }, then: 100 },
            { case: { $eq: ["$profile.verified", true] }, then: 50 }
          ],
          default: 25
        }
      },
      // Handle complex nested transformations
      preferences: {
        $map: {
          input: "$profile.preferences",
          as: "pref",
          in: {
            category: "$$pref.type",
            enabled: "$$pref.active",
            weight: { $multiply: ["$$pref.priority", 10] }
          }
        }
      }
    }
  },
  
  // Load: Flexible output with computed fields
  {
    $project: {
      customer_key: "$customer_id",
      full_name: 1,
      email_domain: 1,
      registration_month: 1,
      profile_score: 1,
      preferences: 1,
      transformation_timestamp: new Date(),
      source_system: "customer_api"
    }
  }
];

// Process with high-performance aggregation
const transformedCustomers = await db.customers.aggregate(customerTransformPipeline).toArray();

// Benefits:
// - Flexible schema handling
// - Complex nested data transformation
// - High-performance parallel processing
// - Real-time processing capabilities
// - Rich transformation operators
```

## ETL Pipeline Architecture

### Data Extraction Patterns

Implement flexible data extraction from multiple sources:

```javascript
// Comprehensive data extraction service
class DataExtractionService {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.rawCollection = db.collection('raw_data');
    this.metadataCollection = db.collection('etl_metadata');
  }

  async extractFromAPI(sourceConfig, extractionId) {
    const extractionMetadata = {
      extraction_id: extractionId,
      source_type: 'api',
      source_config: sourceConfig,
      start_time: new Date(),
      status: 'in_progress',
      records_processed: 0,
      errors: []
    };

    try {
      // API data extraction with pagination
      let hasMore = true;
      let offset = 0;
      const batchSize = sourceConfig.batch_size || 1000;

      while (hasMore) {
        const response = await this.fetchAPIData(sourceConfig, offset, batchSize);
        
        if (response.data && response.data.length > 0) {
          // Prepare documents for insertion
          const documents = response.data.map(record => ({
            ...record,
            _extraction_metadata: {
              extraction_id: extractionId,
              source_url: sourceConfig.url,
              extracted_at: new Date(),
              batch_offset: offset,
              raw_record: true
            }
          }));

          // Bulk insert with ordered operations
          await this.rawCollection.insertMany(documents, {
            ordered: false,
            writeConcern: { w: 1, j: true }
          });

          extractionMetadata.records_processed += documents.length;
          offset += batchSize;
          hasMore = response.has_more;
        } else {
          hasMore = false;
        }

        // Update progress
        await this.updateExtractionProgress(extractionId, extractionMetadata);
      }

      extractionMetadata.status = 'completed';
      extractionMetadata.end_time = new Date();

    } catch (error) {
      extractionMetadata.status = 'failed';
      extractionMetadata.error = error.message;
      extractionMetadata.end_time = new Date();
      throw error;
    } finally {
      await this.metadataCollection.replaceOne(
        { extraction_id: extractionId },
        extractionMetadata,
        { upsert: true }
      );
    }

    return extractionMetadata;
  }

  async extractFromDatabase(dbConfig, query, extractionId) {
    // Database extraction with change tracking
    const extractionMetadata = {
      extraction_id: extractionId,
      source_type: 'database',
      source_config: dbConfig,
      start_time: new Date(),
      status: 'in_progress',
      records_processed: 0
    };

    try {
      // Get last extraction timestamp for incremental updates
      const lastExtraction = await this.metadataCollection.findOne(
        {
          source_type: 'database',
          'source_config.connection_string': dbConfig.connection_string,
          status: 'completed'
        },
        { sort: { end_time: -1 } }
      );

      // Build incremental query
      let incrementalQuery = { ...query };
      if (lastExtraction && dbConfig.incremental_field) {
        incrementalQuery[dbConfig.incremental_field] = {
          $gt: lastExtraction.end_time
        };
      }

      // Extract with cursor for memory efficiency
      const cursor = this.db.collection(dbConfig.collection).find(incrementalQuery);
      const batchSize = 1000;
      let batch = [];
      let recordCount = 0;

      for await (const doc of cursor) {
        // Add extraction metadata
        const enrichedDoc = {
          ...doc,
          _extraction_metadata: {
            extraction_id: extractionId,
            source_database: dbConfig.database,
            source_collection: dbConfig.collection,
            extracted_at: new Date()
          }
        };

        batch.push(enrichedDoc);

        if (batch.length >= batchSize) {
          await this.rawCollection.insertMany(batch, { ordered: false });
          recordCount += batch.length;
          batch = [];

          // Update progress
          extractionMetadata.records_processed = recordCount;
          await this.updateExtractionProgress(extractionId, extractionMetadata);
        }
      }

      // Insert final batch
      if (batch.length > 0) {
        await this.rawCollection.insertMany(batch, { ordered: false });
        recordCount += batch.length;
      }

      extractionMetadata.records_processed = recordCount;
      extractionMetadata.status = 'completed';
      extractionMetadata.end_time = new Date();

    } catch (error) {
      extractionMetadata.status = 'failed';
      extractionMetadata.error = error.message;
      extractionMetadata.end_time = new Date();
      throw error;
    } finally {
      await this.metadataCollection.replaceOne(
        { extraction_id: extractionId },
        extractionMetadata,
        { upsert: true }
      );
    }

    return extractionMetadata;
  }

  async extractFromFiles(fileConfig, extractionId) {
    // File-based extraction (CSV, JSON, XML, etc.)
    const extractionMetadata = {
      extraction_id: extractionId,
      source_type: 'file',
      source_config: fileConfig,
      start_time: new Date(),
      status: 'in_progress',
      files_processed: 0,
      records_processed: 0
    };

    try {
      const files = await this.getFilesFromSource(fileConfig);
      
      for (const filePath of files) {
        const fileData = await this.parseFile(filePath, fileConfig.format);
        
        if (fileData && fileData.length > 0) {
          const enrichedDocuments = fileData.map(record => ({
            ...record,
            _extraction_metadata: {
              extraction_id: extractionId,
              source_file: filePath,
              extracted_at: new Date(),
              file_format: fileConfig.format
            }
          }));

          // Batch insert file data
          const batchSize = 1000;
          for (let i = 0; i < enrichedDocuments.length; i += batchSize) {
            const batch = enrichedDocuments.slice(i, i + batchSize);
            await this.rawCollection.insertMany(batch, { ordered: false });
            extractionMetadata.records_processed += batch.length;
          }
        }

        extractionMetadata.files_processed++;
        await this.updateExtractionProgress(extractionId, extractionMetadata);
      }

      extractionMetadata.status = 'completed';
      extractionMetadata.end_time = new Date();

    } catch (error) {
      extractionMetadata.status = 'failed';
      extractionMetadata.error = error.message;
      extractionMetadata.end_time = new Date();
      throw error;
    } finally {
      await this.metadataCollection.replaceOne(
        { extraction_id: extractionId },
        extractionMetadata,
        { upsert: true }
      );
    }

    return extractionMetadata;
  }

  async fetchAPIData(config, offset, limit) {
    // Implement API-specific data fetching logic
    // This would integrate with actual API clients
    const url = `${config.url}?offset=${offset}&limit=${limit}`;
    // Return { data: [...], has_more: boolean }
    return { data: [], has_more: false }; // Placeholder
  }

  async parseFile(filePath, format) {
    // Implement file parsing logic for various formats
    // CSV, JSON, XML, Parquet, etc.
    return []; // Placeholder
  }

  async getFilesFromSource(config) {
    // Get file list from various sources (S3, FTP, local filesystem)
    return []; // Placeholder
  }

  async updateExtractionProgress(extractionId, metadata) {
    await this.metadataCollection.updateOne(
      { extraction_id: extractionId },
      { $set: metadata },
      { upsert: true }
    );
  }
}
```

### Data Transformation Engine

Build sophisticated data transformation pipelines:

```javascript
// Advanced data transformation service
class DataTransformationService {
  constructor(db) {
    this.db = db;
    this.rawCollection = db.collection('raw_data');
    this.transformedCollection = db.collection('transformed_data');
    this.errorCollection = db.collection('transformation_errors');
  }

  async executeTransformationPipeline(pipelineConfig, transformationId) {
    const transformationMetadata = {
      transformation_id: transformationId,
      pipeline_name: pipelineConfig.name,
      start_time: new Date(),
      status: 'in_progress',
      records_processed: 0,
      records_transformed: 0,
      errors_encountered: 0,
      stages: []
    };

    try {
      // Build dynamic aggregation pipeline
      const aggregationPipeline = this.buildAggregationPipeline(pipelineConfig);
      
      // Execute transformation with error handling
      const transformationResults = await this.executeWithErrorHandling(
        aggregationPipeline, 
        transformationId,
        transformationMetadata
      );

      transformationMetadata.records_transformed = transformationResults.successCount;
      transformationMetadata.errors_encountered = transformationResults.errorCount;
      transformationMetadata.status = 'completed';
      transformationMetadata.end_time = new Date();

      return transformationMetadata;

    } catch (error) {
      transformationMetadata.status = 'failed';
      transformationMetadata.error = error.message;
      transformationMetadata.end_time = new Date();
      throw error;
    }
  }

  buildAggregationPipeline(config) {
    const pipeline = [];

    // Stage 1: Data filtering and source selection
    if (config.source_filter) {
      pipeline.push({
        $match: {
          ...config.source_filter,
          '_extraction_metadata.extraction_id': { $exists: true }
        }
      });
    }

    // Stage 2: Data cleansing and validation
    if (config.cleansing_rules) {
      pipeline.push({
        $addFields: {
          // Clean and validate data
          cleaned_data: {
            $let: {
              vars: {
                cleaned: {
                  $switch: {
                    branches: config.cleansing_rules.map(rule => ({
                      case: rule.condition,
                      then: rule.transformation
                    })),
                    default: "$$ROOT"
                  }
                }
              },
              in: "$$cleaned"
            }
          }
        }
      });
    }

    // Stage 3: Data enrichment and computed fields
    if (config.enrichment_rules) {
      const enrichmentFields = {};
      
      config.enrichment_rules.forEach(rule => {
        enrichmentFields[rule.target_field] = rule.computation;
      });

      pipeline.push({
        $addFields: enrichmentFields
      });
    }

    // Stage 4: Nested document transformations
    if (config.nested_transformations) {
      config.nested_transformations.forEach(transformation => {
        if (transformation.type === 'array_processing') {
          pipeline.push({
            $addFields: {
              [transformation.target_field]: {
                $map: {
                  input: `$${transformation.source_field}`,
                  as: "item",
                  in: transformation.item_transformation
                }
              }
            }
          });
        } else if (transformation.type === 'object_flattening') {
          pipeline.push({
            $addFields: this.buildFlatteningTransformation(transformation)
          });
        }
      });
    }

    // Stage 5: Data aggregation and grouping
    if (config.aggregation_rules) {
      config.aggregation_rules.forEach(rule => {
        if (rule.type === 'group') {
          pipeline.push({
            $group: {
              _id: rule.group_by,
              ...rule.aggregations
            }
          });
        } else if (rule.type === 'bucket') {
          pipeline.push({
            $bucket: {
              groupBy: rule.group_by,
              boundaries: rule.boundaries,
              default: rule.default_bucket,
              output: rule.output
            }
          });
        }
      });
    }

    // Stage 6: Output formatting and projection
    if (config.output_format) {
      pipeline.push({
        $project: {
          ...config.output_format.fields,
          _transformation_metadata: {
            transformation_id: config.transformation_id,
            pipeline_name: config.name,
            transformed_at: new Date(),
            source_extraction_id: "$_extraction_metadata.extraction_id"
          }
        }
      });
    }

    return pipeline;
  }

  async executeWithErrorHandling(pipeline, transformationId, metadata) {
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 1000;

    try {
      // Use aggregation cursor for memory-efficient processing
      const cursor = this.rawCollection.aggregate(pipeline, {
        allowDiskUse: true,
        cursor: { batchSize }
      });

      let batch = [];

      for await (const document of cursor) {
        try {
          // Additional validation can be performed here
          if (this.validateTransformedDocument(document)) {
            batch.push(document);
            successCount++;
          } else {
            await this.logTransformationError(
              transformationId,
              document,
              'validation_failed',
              'Document failed validation rules'
            );
            errorCount++;
          }

          // Process batch when full
          if (batch.length >= batchSize) {
            await this.insertTransformedBatch(batch, transformationId);
            batch = [];
          }

        } catch (docError) {
          await this.logTransformationError(
            transformationId,
            document,
            'processing_error',
            docError.message
          );
          errorCount++;
        }
      }

      // Insert remaining documents
      if (batch.length > 0) {
        await this.insertTransformedBatch(batch, transformationId);
      }

      return { successCount, errorCount };

    } catch (pipelineError) {
      throw new Error(`Pipeline execution failed: ${pipelineError.message}`);
    }
  }

  buildFlatteningTransformation(config) {
    const flattenedFields = {};
    
    // Flatten nested object structure
    const flattenObject = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'object' && !Array.isArray(value)) {
          flattenObject(value, newKey);
        } else {
          flattenedFields[newKey.replace('.', '_')] = `$${newKey}`;
        }
      }
    };

    flattenObject(config.source_structure);
    return flattenedFields;
  }

  async insertTransformedBatch(batch, transformationId) {
    try {
      await this.transformedCollection.insertMany(batch, {
        ordered: false,
        writeConcern: { w: 1, j: true }
      });
    } catch (error) {
      // Handle partial failures in batch
      if (error.writeErrors) {
        for (const writeError of error.writeErrors) {
          await this.logTransformationError(
            transformationId,
            batch[writeError.index],
            'insert_error',
            writeError.errmsg
          );
        }
      } else {
        throw error;
      }
    }
  }

  validateTransformedDocument(doc) {
    // Implement document validation logic
    // Check required fields, data types, business rules, etc.
    return true; // Placeholder
  }

  async logTransformationError(transformationId, document, errorType, errorMessage) {
    const errorDoc = {
      transformation_id: transformationId,
      error_type: errorType,
      error_message: errorMessage,
      failed_document_id: document._id,
      failed_document_sample: JSON.stringify(document).substring(0, 1000),
      timestamp: new Date()
    };

    await this.errorCollection.insertOne(errorDoc);
  }

  // Complex transformation functions
  async executeCustomTransformations(documents, transformationConfig) {
    return documents.map(doc => {
      let transformedDoc = { ...doc };

      // Text processing transformations
      if (transformationConfig.text_processing) {
        transformedDoc = this.applyTextTransformations(transformedDoc, transformationConfig.text_processing);
      }

      // Date and time transformations
      if (transformationConfig.date_processing) {
        transformedDoc = this.applyDateTransformations(transformedDoc, transformationConfig.date_processing);
      }

      // Numerical computations
      if (transformationConfig.numerical_processing) {
        transformedDoc = this.applyNumericalTransformations(transformedDoc, transformationConfig.numerical_processing);
      }

      return transformedDoc;
    });
  }

  applyTextTransformations(doc, config) {
    // Text cleaning, normalization, extraction
    config.forEach(rule => {
      const fieldValue = this.getNestedValue(doc, rule.field);
      if (fieldValue && typeof fieldValue === 'string') {
        switch (rule.operation) {
          case 'normalize':
            this.setNestedValue(doc, rule.field, fieldValue.toLowerCase().trim());
            break;
          case 'extract_email':
            const emailMatch = fieldValue.match(/[\w\.-]+@[\w\.-]+\.\w+/);
            if (emailMatch) {
              this.setNestedValue(doc, rule.target_field, emailMatch[0]);
            }
            break;
          case 'extract_phone':
            const phoneMatch = fieldValue.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
            if (phoneMatch) {
              this.setNestedValue(doc, rule.target_field, phoneMatch[0]);
            }
            break;
          case 'split':
            const parts = fieldValue.split(rule.delimiter);
            this.setNestedValue(doc, rule.target_field, parts);
            break;
        }
      }
    });
    
    return doc;
  }

  applyDateTransformations(doc, config) {
    // Date parsing, formatting, calculations
    config.forEach(rule => {
      const fieldValue = this.getNestedValue(doc, rule.field);
      if (fieldValue) {
        switch (rule.operation) {
          case 'parse_date':
            const parsedDate = new Date(fieldValue);
            if (!isNaN(parsedDate.getTime())) {
              this.setNestedValue(doc, rule.target_field, parsedDate);
            }
            break;
          case 'extract_components':
            const date = new Date(fieldValue);
            if (!isNaN(date.getTime())) {
              this.setNestedValue(doc, `${rule.target_field}_year`, date.getFullYear());
              this.setNestedValue(doc, `${rule.target_field}_month`, date.getMonth() + 1);
              this.setNestedValue(doc, `${rule.target_field}_day`, date.getDate());
            }
            break;
          case 'age_calculation':
            const birthDate = new Date(fieldValue);
            const age = Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
            this.setNestedValue(doc, rule.target_field, age);
            break;
        }
      }
    });
    
    return doc;
  }

  applyNumericalTransformations(doc, config) {
    // Numerical calculations, conversions, aggregations
    config.forEach(rule => {
      const fieldValue = this.getNestedValue(doc, rule.field);
      if (typeof fieldValue === 'number') {
        switch (rule.operation) {
          case 'currency_conversion':
            const convertedValue = fieldValue * rule.exchange_rate;
            this.setNestedValue(doc, rule.target_field, Math.round(convertedValue * 100) / 100);
            break;
          case 'percentage_calculation':
            const total = this.getNestedValue(doc, rule.total_field);
            if (total && total !== 0) {
              const percentage = (fieldValue / total) * 100;
              this.setNestedValue(doc, rule.target_field, Math.round(percentage * 100) / 100);
            }
            break;
          case 'range_classification':
            let classification = 'unknown';
            for (const range of rule.ranges) {
              if (fieldValue >= range.min && fieldValue <= range.max) {
                classification = range.label;
                break;
              }
            }
            this.setNestedValue(doc, rule.target_field, classification);
            break;
        }
      }
    });
    
    return doc;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  setNestedValue(obj, path, value) {
    const props = path.split('.');
    const lastProp = props.pop();
    const target = props.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {};
      return current[prop];
    }, obj);
    target[lastProp] = value;
  }
}
```

### Data Loading and Output Management

Implement flexible data loading strategies:

```javascript
// Data loading and output service
class DataLoadingService {
  constructor(db) {
    this.db = db;
    this.transformedCollection = db.collection('transformed_data');
    this.outputMetadataCollection = db.collection('output_metadata');
  }

  async loadToMongoDB(targetConfig, loadId) {
    const loadMetadata = {
      load_id: loadId,
      target_type: 'mongodb',
      target_config: targetConfig,
      start_time: new Date(),
      status: 'in_progress',
      records_loaded: 0,
      errors: []
    };

    try {
      const targetCollection = this.db.collection(targetConfig.collection);
      
      // Configure loading strategy
      const loadingStrategy = targetConfig.strategy || 'append';
      
      if (loadingStrategy === 'replace') {
        // Clear target collection before loading
        await targetCollection.deleteMany({});
      }

      // Load data in batches
      const batchSize = targetConfig.batch_size || 1000;
      const pipeline = this.buildLoadingPipeline(targetConfig);
      const cursor = this.transformedCollection.aggregate(pipeline, {
        allowDiskUse: true,
        cursor: { batchSize }
      });

      let batch = [];
      let recordCount = 0;

      for await (const doc of cursor) {
        // Apply final transformations for target schema
        const finalDoc = this.applyTargetTransformations(doc, targetConfig);
        
        batch.push(finalDoc);

        if (batch.length >= batchSize) {
          await this.insertBatch(targetCollection, batch, loadingStrategy);
          recordCount += batch.length;
          batch = [];

          // Update progress
          loadMetadata.records_loaded = recordCount;
          await this.updateLoadProgress(loadId, loadMetadata);
        }
      }

      // Insert final batch
      if (batch.length > 0) {
        await this.insertBatch(targetCollection, batch, loadingStrategy);
        recordCount += batch.length;
      }

      // Create indexes if specified
      if (targetConfig.indexes) {
        await this.createTargetIndexes(targetCollection, targetConfig.indexes);
      }

      loadMetadata.records_loaded = recordCount;
      loadMetadata.status = 'completed';
      loadMetadata.end_time = new Date();

    } catch (error) {
      loadMetadata.status = 'failed';
      loadMetadata.error = error.message;
      loadMetadata.end_time = new Date();
      throw error;
    } finally {
      await this.outputMetadataCollection.replaceOne(
        { load_id: loadId },
        loadMetadata,
        { upsert: true }
      );
    }

    return loadMetadata;
  }

  async loadToWarehouse(warehouseConfig, loadId) {
    // Load data to external data warehouse (Snowflake, Redshift, BigQuery)
    const loadMetadata = {
      load_id: loadId,
      target_type: 'warehouse',
      target_config: warehouseConfig,
      start_time: new Date(),
      status: 'in_progress'
    };

    try {
      // Export data to format compatible with warehouse
      const exportFormat = warehouseConfig.format || 'parquet';
      const exportPath = await this.exportToFile(warehouseConfig, exportFormat);

      // Upload to warehouse staging area
      await this.uploadToWarehouse(exportPath, warehouseConfig);

      // Execute warehouse loading commands
      const loadResults = await this.executeWarehouseLoad(warehouseConfig);

      loadMetadata.records_loaded = loadResults.recordCount;
      loadMetadata.warehouse_table = loadResults.tableName;
      loadMetadata.status = 'completed';
      loadMetadata.end_time = new Date();

    } catch (error) {
      loadMetadata.status = 'failed';
      loadMetadata.error = error.message;
      loadMetadata.end_time = new Date();
      throw error;
    } finally {
      await this.outputMetadataCollection.replaceOne(
        { load_id: loadId },
        loadMetadata,
        { upsert: true }
      );
    }

    return loadMetadata;
  }

  async loadToAPI(apiConfig, loadId) {
    // Push data to external APIs
    const loadMetadata = {
      load_id: loadId,
      target_type: 'api',
      target_config: apiConfig,
      start_time: new Date(),
      status: 'in_progress',
      api_calls_made: 0,
      records_sent: 0
    };

    try {
      const batchSize = apiConfig.batch_size || 100;
      const pipeline = this.buildLoadingPipeline(apiConfig);
      const cursor = this.transformedCollection.aggregate(pipeline);

      let batch = [];
      let apiCallCount = 0;
      let recordCount = 0;

      for await (const doc of cursor) {
        const apiDoc = this.formatForAPI(doc, apiConfig);
        batch.push(apiDoc);

        if (batch.length >= batchSize) {
          await this.sendToAPI(batch, apiConfig);
          apiCallCount++;
          recordCount += batch.length;
          batch = [];

          // Rate limiting
          if (apiConfig.rate_limit_delay) {
            await this.delay(apiConfig.rate_limit_delay);
          }

          // Update progress
          loadMetadata.api_calls_made = apiCallCount;
          loadMetadata.records_sent = recordCount;
          await this.updateLoadProgress(loadId, loadMetadata);
        }
      }

      // Send final batch
      if (batch.length > 0) {
        await this.sendToAPI(batch, apiConfig);
        apiCallCount++;
        recordCount += batch.length;
      }

      loadMetadata.api_calls_made = apiCallCount;
      loadMetadata.records_sent = recordCount;
      loadMetadata.status = 'completed';
      loadMetadata.end_time = new Date();

    } catch (error) {
      loadMetadata.status = 'failed';
      loadMetadata.error = error.message;
      loadMetadata.end_time = new Date();
      throw error;
    } finally {
      await this.outputMetadataCollection.replaceOne(
        { load_id: loadId },
        loadMetadata,
        { upsert: true }
      );
    }

    return loadMetadata;
  }

  buildLoadingPipeline(config) {
    const pipeline = [];

    // Filter data for loading
    if (config.filter) {
      pipeline.push({ $match: config.filter });
    }

    // Sort for consistent ordering
    if (config.sort) {
      pipeline.push({ $sort: config.sort });
    }

    // Limit if specified
    if (config.limit) {
      pipeline.push({ $limit: config.limit });
    }

    // Project fields for target format
    if (config.projection) {
      pipeline.push({ $project: config.projection });
    }

    return pipeline;
  }

  applyTargetTransformations(doc, config) {
    let transformedDoc = { ...doc };

    // Apply target-specific field mappings
    if (config.field_mappings) {
      const mappedDoc = {};
      for (const [sourceField, targetField] of Object.entries(config.field_mappings)) {
        const value = this.getNestedValue(transformedDoc, sourceField);
        if (value !== undefined) {
          this.setNestedValue(mappedDoc, targetField, value);
        }
      }
      transformedDoc = { ...transformedDoc, ...mappedDoc };
    }

    // Apply data type conversions
    if (config.type_conversions) {
      config.type_conversions.forEach(conversion => {
        const value = this.getNestedValue(transformedDoc, conversion.field);
        if (value !== undefined) {
          const convertedValue = this.convertDataType(value, conversion.target_type, conversion.options);
          this.setNestedValue(transformedDoc, conversion.field, convertedValue);
        }
      });
    }

    return transformedDoc;
  }

  async insertBatch(collection, batch, strategy) {
    if (strategy === 'upsert') {
      // Perform upsert operations
      const bulkOps = batch.map(doc => ({
        replaceOne: {
          filter: { [doc._id ? '_id' : 'unique_key']: doc._id || doc.unique_key },
          replacement: doc,
          upsert: true
        }
      }));
      await collection.bulkWrite(bulkOps, { ordered: false });
    } else {
      // Regular insert
      await collection.insertMany(batch, { ordered: false });
    }
  }

  async createTargetIndexes(collection, indexDefinitions) {
    for (const indexDef of indexDefinitions) {
      try {
        await collection.createIndex(indexDef.fields, indexDef.options || {});
      } catch (error) {
        console.warn(`Failed to create index: ${error.message}`);
      }
    }
  }

  convertDataType(value, targetType, options = {}) {
    switch (targetType) {
      case 'string':
        return String(value);
      case 'number':
        return Number(value);
      case 'date':
        return new Date(value);
      case 'boolean':
        return Boolean(value);
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'object':
        return typeof value === 'object' ? value : { value };
      default:
        return value;
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  setNestedValue(obj, path, value) {
    const props = path.split('.');
    const lastProp = props.pop();
    const target = props.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {};
      return current[prop];
    }, obj);
    target[lastProp] = value;
  }

  async updateLoadProgress(loadId, metadata) {
    await this.outputMetadataCollection.updateOne(
      { load_id: loadId },
      { $set: metadata },
      { upsert: true }
    );
  }

  async exportToFile(config, format) {
    // Implement file export logic
    return '/tmp/export.parquet'; // Placeholder
  }

  async uploadToWarehouse(filePath, config) {
    // Implement warehouse upload logic
  }

  async executeWarehouseLoad(config) {
    // Execute warehouse-specific loading commands
    return { recordCount: 0, tableName: config.table }; // Placeholder
  }

  formatForAPI(doc, config) {
    // Format document according to API requirements
    return doc; // Placeholder
  }

  async sendToAPI(batch, config) {
    // Send data to external API
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Real-Time Stream Processing

### Change Stream ETL

Implement real-time ETL using MongoDB change streams:

```javascript
// Real-time ETL using change streams
class StreamETLProcessor {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.changeStreams = new Map();
    this.transformationService = new DataTransformationService(db);
    this.loadingService = new DataLoadingService(db);
  }

  async startStreamProcessing(streamConfig) {
    const sourceCollection = this.db.collection(streamConfig.source_collection);
    
    // Configure change stream options
    const changeStreamOptions = {
      fullDocument: 'updateLookup',
      resumeAfter: streamConfig.resume_token,
      maxAwaitTimeMS: 1000
    };

    // Create change stream with pipeline filter
    const pipeline = [];
    if (streamConfig.operation_filter) {
      pipeline.push({
        $match: {
          'operationType': { $in: streamConfig.operation_filter }
        }
      });
    }

    if (streamConfig.document_filter) {
      pipeline.push({
        $match: {
          'fullDocument': streamConfig.document_filter
        }
      });
    }

    const changeStream = sourceCollection.watch(pipeline, changeStreamOptions);
    this.changeStreams.set(streamConfig.stream_id, changeStream);

    // Process change events
    changeStream.on('change', async (changeEvent) => {
      try {
        await this.processChangeEvent(changeEvent, streamConfig);
      } catch (error) {
        console.error('Error processing change event:', error);
        await this.handleStreamError(error, changeEvent, streamConfig);
      }
    });

    changeStream.on('error', async (error) => {
      console.error('Change stream error:', error);
      await this.handleStreamError(error, null, streamConfig);
    });

    console.log(`Started stream processing for ${streamConfig.stream_id}`);
    return changeStream;
  }

  async processChangeEvent(changeEvent, streamConfig) {
    const processingMetadata = {
      stream_id: streamConfig.stream_id,
      change_event_id: changeEvent._id,
      operation_type: changeEvent.operationType,
      processing_time: new Date(),
      status: 'processing'
    };

    try {
      let documentToProcess = null;

      // Extract document based on operation type
      switch (changeEvent.operationType) {
        case 'insert':
        case 'replace':
          documentToProcess = changeEvent.fullDocument;
          break;
        case 'update':
          documentToProcess = changeEvent.fullDocument;
          // Include update description for delta processing
          documentToProcess._updateDescription = changeEvent.updateDescription;
          break;
        case 'delete':
          documentToProcess = changeEvent.fullDocumentBeforeChange || 
                             { _id: changeEvent.documentKey._id, _deleted: true };
          break;
      }

      if (documentToProcess) {
        // Apply real-time transformations
        const transformedDocument = await this.applyStreamTransformations(
          documentToProcess, 
          streamConfig.transformations,
          changeEvent
        );

        // Apply business rules and validations
        if (streamConfig.business_rules) {
          const validationResult = await this.validateBusinessRules(
            transformedDocument,
            streamConfig.business_rules,
            changeEvent
          );

          if (!validationResult.valid) {
            await this.handleValidationFailure(validationResult, transformedDocument, streamConfig);
            return;
          }
        }

        // Load to target systems
        if (streamConfig.target_systems) {
          await this.loadToTargetSystems(
            transformedDocument,
            streamConfig.target_systems,
            changeEvent
          );
        }

        // Update processing status
        processingMetadata.status = 'completed';
        processingMetadata.records_processed = 1;

      }

      await this.logStreamProcessing(processingMetadata);

    } catch (error) {
      processingMetadata.status = 'failed';
      processingMetadata.error = error.message;
      await this.logStreamProcessing(processingMetadata);
      throw error;
    }
  }

  async applyStreamTransformations(document, transformations, changeEvent) {
    let transformedDoc = { ...document };

    for (const transformation of transformations) {
      switch (transformation.type) {
        case 'field_mapping':
          transformedDoc = this.applyFieldMapping(transformedDoc, transformation.mapping);
          break;
        
        case 'computed_fields':
          transformedDoc = await this.applyComputedFields(transformedDoc, transformation.computations);
          break;
        
        case 'enrichment':
          transformedDoc = await this.applyEnrichment(transformedDoc, transformation.enrichment_config);
          break;
        
        case 'aggregation':
          transformedDoc = await this.applyStreamAggregation(transformedDoc, transformation.aggregation_config, changeEvent);
          break;
        
        case 'custom_function':
          transformedDoc = await transformation.function(transformedDoc, changeEvent);
          break;
      }
    }

    // Add stream processing metadata
    transformedDoc._stream_metadata = {
      stream_id: changeEvent.streamId,
      change_event_id: changeEvent._id,
      operation_type: changeEvent.operationType,
      processed_at: new Date(),
      cluster_time: changeEvent.clusterTime
    };

    return transformedDoc;
  }

  async applyComputedFields(document, computations) {
    const enrichedDoc = { ...document };

    for (const computation of computations) {
      try {
        let computedValue = null;

        switch (computation.type) {
          case 'lookup':
            computedValue = await this.performLookup(document, computation.config);
            break;
          
          case 'calculation':
            computedValue = this.performCalculation(document, computation.config);
            break;
          
          case 'text_processing':
            computedValue = this.performTextProcessing(document, computation.config);
            break;
          
          case 'date_calculation':
            computedValue = this.performDateCalculation(document, computation.config);
            break;
        }

        if (computedValue !== null) {
          this.setNestedValue(enrichedDoc, computation.target_field, computedValue);
        }

      } catch (error) {
        console.warn(`Failed to compute field ${computation.target_field}:`, error);
      }
    }

    return enrichedDoc;
  }

  async applyEnrichment(document, enrichmentConfig) {
    const enrichedDoc = { ...document };

    for (const enrichment of enrichmentConfig) {
      try {
        const lookupCollection = this.db.collection(enrichment.lookup_collection);
        const lookupKey = this.getNestedValue(document, enrichment.source_field);

        if (lookupKey) {
          const lookupDoc = await lookupCollection.findOne({
            [enrichment.lookup_field]: lookupKey
          });

          if (lookupDoc) {
            // Merge lookup data
            if (enrichment.merge_strategy === 'full') {
              Object.assign(enrichedDoc, lookupDoc);
            } else if (enrichment.merge_strategy === 'selective') {
              enrichment.fields_to_merge.forEach(field => {
                if (lookupDoc[field] !== undefined) {
                  this.setNestedValue(enrichedDoc, enrichment.target_prefix + field, lookupDoc[field]);
                }
              });
            }
          }
        }

      } catch (error) {
        console.warn(`Failed to apply enrichment ${enrichment.name}:`, error);
      }
    }

    return enrichedDoc;
  }

  async applyStreamAggregation(document, aggregationConfig, changeEvent) {
    const aggregatedDoc = { ...document };

    // Real-time aggregation using upsert operations
    for (const aggregation of aggregationConfig) {
      try {
        const aggregationCollection = this.db.collection(aggregation.target_collection);
        const groupingKey = this.buildGroupingKey(document, aggregation.group_by);

        // Build update operations for real-time aggregation
        const updateOps = {};

        aggregation.aggregations.forEach(agg => {
          const sourceValue = this.getNestedValue(document, agg.source_field);
          
          switch (agg.operation) {
            case 'sum':
              updateOps.$inc = updateOps.$inc || {};
              updateOps.$inc[agg.target_field] = sourceValue || 0;
              break;
            
            case 'count':
              updateOps.$inc = updateOps.$inc || {};
              updateOps.$inc[agg.target_field] = 1;
              break;
            
            case 'avg':
              updateOps.$inc = updateOps.$inc || {};
              updateOps.$inc[`${agg.target_field}_sum`] = sourceValue || 0;
              updateOps.$inc[`${agg.target_field}_count`] = 1;
              break;
            
            case 'min':
              updateOps.$min = updateOps.$min || {};
              updateOps.$min[agg.target_field] = sourceValue;
              break;
            
            case 'max':
              updateOps.$max = updateOps.$max || {};
              updateOps.$max[agg.target_field] = sourceValue;
              break;
            
            case 'addToSet':
              updateOps.$addToSet = updateOps.$addToSet || {};
              updateOps.$addToSet[agg.target_field] = sourceValue;
              break;
          }
        });

        // Set metadata fields
        updateOps.$set = updateOps.$set || {};
        updateOps.$set.last_updated = new Date();
        updateOps.$set.last_change_event = changeEvent._id;

        // Perform upsert operation
        await aggregationCollection.updateOne(
          groupingKey,
          updateOps,
          { upsert: true }
        );

      } catch (error) {
        console.warn(`Failed to apply stream aggregation ${aggregation.name}:`, error);
      }
    }

    return aggregatedDoc;
  }

  buildGroupingKey(document, groupByConfig) {
    const groupingKey = {};
    
    if (Array.isArray(groupByConfig)) {
      groupByConfig.forEach(field => {
        const value = this.getNestedValue(document, field);
        groupingKey[field.replace('.', '_')] = value;
      });
    } else if (typeof groupByConfig === 'object') {
      Object.entries(groupByConfig).forEach(([key, expression]) => {
        // Support for complex grouping expressions
        groupingKey[key] = this.evaluateExpression(document, expression);
      });
    }
    
    return groupingKey;
  }

  async validateBusinessRules(document, businessRules, changeEvent) {
    const validationResult = {
      valid: true,
      failures: [],
      warnings: []
    };

    for (const rule of businessRules) {
      try {
        const ruleResult = await this.evaluateBusinessRule(document, rule, changeEvent);
        
        if (!ruleResult.passed) {
          if (rule.severity === 'error') {
            validationResult.valid = false;
            validationResult.failures.push({
              rule: rule.name,
              message: ruleResult.message
            });
          } else if (rule.severity === 'warning') {
            validationResult.warnings.push({
              rule: rule.name,
              message: ruleResult.message
            });
          }
        }

      } catch (error) {
        validationResult.valid = false;
        validationResult.failures.push({
          rule: rule.name,
          message: `Rule evaluation failed: ${error.message}`
        });
      }
    }

    return validationResult;
  }

  async evaluateBusinessRule(document, rule, changeEvent) {
    switch (rule.type) {
      case 'field_validation':
        return this.validateField(document, rule.config);
      
      case 'cross_document_validation':
        return await this.validateCrossDocument(document, rule.config);
      
      case 'temporal_validation':
        return this.validateTemporal(document, changeEvent, rule.config);
      
      case 'custom_validation':
        return await rule.config.validator(document, changeEvent);
      
      default:
        return { passed: true };
    }
  }

  validateField(document, config) {
    const fieldValue = this.getNestedValue(document, config.field);
    
    // Check required fields
    if (config.required && (fieldValue === undefined || fieldValue === null)) {
      return {
        passed: false,
        message: `Required field '${config.field}' is missing`
      };
    }

    // Check data type
    if (fieldValue !== undefined && config.data_type) {
      const actualType = typeof fieldValue;
      if (actualType !== config.data_type) {
        return {
          passed: false,
          message: `Field '${config.field}' expected type ${config.data_type}, got ${actualType}`
        };
      }
    }

    // Check value range
    if (fieldValue !== undefined && config.range) {
      if (fieldValue < config.range.min || fieldValue > config.range.max) {
        return {
          passed: false,
          message: `Field '${config.field}' value ${fieldValue} is outside range [${config.range.min}, ${config.range.max}]`
        };
      }
    }

    // Check allowed values
    if (fieldValue !== undefined && config.allowed_values) {
      if (!config.allowed_values.includes(fieldValue)) {
        return {
          passed: false,
          message: `Field '${config.field}' value '${fieldValue}' is not in allowed values: ${config.allowed_values.join(', ')}`
        };
      }
    }

    return { passed: true };
  }

  async validateCrossDocument(document, config) {
    const referenceCollection = this.db.collection(config.reference_collection);
    const referenceValue = this.getNestedValue(document, config.source_field);
    
    if (referenceValue) {
      const referenceDoc = await referenceCollection.findOne({
        [config.reference_field]: referenceValue
      });

      if (!referenceDoc && config.required) {
        return {
          passed: false,
          message: `Reference document not found for ${config.source_field}: ${referenceValue}`
        };
      }

      // Additional cross-document validations
      if (referenceDoc && config.additional_checks) {
        for (const check of config.additional_checks) {
          const refValue = this.getNestedValue(referenceDoc, check.reference_field);
          const docValue = this.getNestedValue(document, check.document_field);
          
          if (!this.compareValues(docValue, refValue, check.comparison)) {
            return {
              passed: false,
              message: `Cross-document validation failed: ${check.message}`
            };
          }
        }
      }
    }

    return { passed: true };
  }

  validateTemporal(document, changeEvent, config) {
    const timestamp = changeEvent.clusterTime || new Date();
    
    // Check business hours
    if (config.business_hours) {
      const hour = timestamp.getHours();
      if (hour < config.business_hours.start || hour > config.business_hours.end) {
        return {
          passed: false,
          message: `Operation outside business hours: ${hour}`
        };
      }
    }

    // Check rate limits
    if (config.rate_limit) {
      // This would require additional state tracking
      // Implementation depends on specific rate limiting strategy
    }

    return { passed: true };
  }

  compareValues(value1, value2, comparison) {
    switch (comparison) {
      case 'eq': return value1 === value2;
      case 'ne': return value1 !== value2;
      case 'gt': return value1 > value2;
      case 'gte': return value1 >= value2;
      case 'lt': return value1 < value2;
      case 'lte': return value1 <= value2;
      default: return false;
    }
  }

  async loadToTargetSystems(document, targetSystems, changeEvent) {
    for (const target of targetSystems) {
      try {
        switch (target.type) {
          case 'mongodb':
            await this.loadToMongoTarget(document, target.config);
            break;
          
          case 'elasticsearch':
            await this.loadToElasticsearch(document, target.config);
            break;
          
          case 'kafka':
            await this.loadToKafka(document, target.config, changeEvent);
            break;
          
          case 'webhook':
            await this.loadToWebhook(document, target.config);
            break;
        }

      } catch (error) {
        console.error(`Failed to load to target system ${target.name}:`, error);
        await this.handleTargetLoadError(error, document, target, changeEvent);
      }
    }
  }

  async loadToMongoTarget(document, config) {
    const targetCollection = this.db.collection(config.collection);
    
    if (config.strategy === 'upsert') {
      const filter = {};
      config.unique_fields.forEach(field => {
        filter[field] = this.getNestedValue(document, field);
      });
      
      await targetCollection.replaceOne(filter, document, { upsert: true });
    } else {
      await targetCollection.insertOne(document);
    }
  }

  async loadToKafka(document, config, changeEvent) {
    // Send to Kafka topic
    const message = {
      key: this.getNestedValue(document, config.key_field),
      value: JSON.stringify(document),
      headers: {
        operation_type: changeEvent.operationType,
        timestamp: new Date().toISOString()
      }
    };

    // This would use a Kafka producer client
    console.log(`Would send to Kafka topic ${config.topic}:`, message);
  }

  async loadToWebhook(document, config) {
    // Send HTTP request to webhook
    const payload = {
      data: document,
      timestamp: new Date().toISOString(),
      source: 'mongodb-etl'
    };

    // This would use an HTTP client
    console.log(`Would send webhook to ${config.url}:`, payload);
  }

  async handleStreamError(error, changeEvent, streamConfig) {
    // Log stream processing errors
    const errorDoc = {
      stream_id: streamConfig.stream_id,
      error_type: 'stream_processing_error',
      error_message: error.message,
      change_event: changeEvent,
      timestamp: new Date()
    };

    await this.db.collection('stream_errors').insertOne(errorDoc);
  }

  async handleValidationFailure(validationResult, document, streamConfig) {
    // Handle business rule validation failures
    const failureDoc = {
      stream_id: streamConfig.stream_id,
      failure_type: 'validation_failure',
      validation_failures: validationResult.failures,
      validation_warnings: validationResult.warnings,
      document: document,
      timestamp: new Date()
    };

    await this.db.collection('validation_failures').insertOne(failureDoc);
  }

  async handleTargetLoadError(error, document, target, changeEvent) {
    // Handle target system loading errors
    const errorDoc = {
      target_system: target.name,
      error_type: 'target_load_error',
      error_message: error.message,
      document: document,
      change_event_id: changeEvent._id,
      timestamp: new Date()
    };

    await this.db.collection('target_load_errors').insertOne(errorDoc);
  }

  performLookup(document, config) {
    // Implement lookup logic
    return null; // Placeholder
  }

  performCalculation(document, config) {
    // Implement calculation logic
    return null; // Placeholder
  }

  performTextProcessing(document, config) {
    // Implement text processing logic
    return null; // Placeholder
  }

  performDateCalculation(document, config) {
    // Implement date calculation logic
    return null; // Placeholder
  }

  evaluateExpression(document, expression) {
    // Implement expression evaluation
    return null; // Placeholder
  }

  applyFieldMapping(document, mapping) {
    // Implement field mapping logic
    return document; // Placeholder
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  setNestedValue(obj, path, value) {
    const props = path.split('.');
    const lastProp = props.pop();
    const target = props.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {};
      return current[prop];
    }, obj);
    target[lastProp] = value;
  }

  async logStreamProcessing(metadata) {
    await this.db.collection('stream_processing_log').insertOne(metadata);
  }

  async stopStreamProcessing(streamId) {
    const changeStream = this.changeStreams.get(streamId);
    if (changeStream) {
      await changeStream.close();
      this.changeStreams.delete(streamId);
      console.log(`Stopped stream processing for ${streamId}`);
    }
  }
}
```

## SQL-Style ETL with QueryLeaf

QueryLeaf provides familiar SQL-style ETL operations with MongoDB's powerful aggregation capabilities:

```sql
-- QueryLeaf ETL operations with SQL-familiar syntax

-- Data extraction with SQL-style filtering and projection
WITH extracted_data AS (
  SELECT 
    customer_id,
    email,
    first_name,
    last_name,
    registration_date,
    profile_data,
    last_login_date,
    CASE 
      WHEN profile_data->>'premium' = 'true' THEN 'premium'
      WHEN profile_data->>'verified' = 'true' THEN 'verified'
      ELSE 'basic'
    END AS customer_tier
  FROM raw_customers
  WHERE registration_date >= CURRENT_DATE - INTERVAL '30 days'
    AND email IS NOT NULL
    AND email LIKE '%@%.%'
)

-- Data transformation with complex calculations
, transformed_data AS (
  SELECT 
    customer_id,
    CONCAT(first_name, ' ', last_name) AS full_name,
    LOWER(email) AS normalized_email,
    SUBSTRING(email FROM POSITION('@' IN email) + 1) AS email_domain,
    DATE_TRUNC('month', registration_date) AS registration_month,
    customer_tier,
    
    -- Customer lifecycle calculations
    CASE 
      WHEN last_login_date >= CURRENT_DATE - INTERVAL '7 days' THEN 'active'
      WHEN last_login_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'inactive'
      ELSE 'dormant'
    END AS activity_status,
    
    -- Age calculation
    EXTRACT(DAYS FROM (CURRENT_DATE - registration_date)) AS days_since_registration,
    
    -- JSON processing and nested field extraction
    JSON_EXTRACT(profile_data, '$.preferences.notifications') AS notification_preferences,
    ARRAY_LENGTH(JSON_EXTRACT(profile_data, '$.purchase_history')) AS purchase_count,
    
    -- Computed engagement score
    CASE 
      WHEN customer_tier = 'premium' THEN 100
      WHEN days_since_registration < 30 AND last_login_date >= CURRENT_DATE - INTERVAL '7 days' THEN 75
      WHEN customer_tier = 'verified' THEN 50
      ELSE 25
    END AS engagement_score,
    
    CURRENT_TIMESTAMP AS transformation_timestamp
  FROM extracted_data
)

-- Data aggregation and analytical computations
, aggregated_metrics AS (
  SELECT 
    email_domain,
    registration_month,
    customer_tier,
    activity_status,
    COUNT(*) as customer_count,
    AVG(engagement_score) as avg_engagement_score,
    COUNT(CASE WHEN activity_status = 'active' THEN 1 END) as active_customers,
    COUNT(CASE WHEN days_since_registration < 7 THEN 1 END) as new_customers,
    
    -- Advanced aggregations
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY engagement_score) as median_engagement,
    STDDEV(engagement_score) as engagement_variance,
    
    -- Array aggregations
    ARRAY_AGG(customer_id ORDER BY engagement_score DESC LIMIT 10) as top_customers,
    
    -- JSON aggregation for complex data structures
    JSON_OBJECT_AGG(
      customer_tier, 
      JSON_OBJECT(
        'count', COUNT(*),
        'avg_score', AVG(engagement_score)
      )
    ) as tier_metrics
    
  FROM transformed_data
  GROUP BY email_domain, registration_month, customer_tier, activity_status
  HAVING COUNT(*) >= 5  -- Filter out small groups
)

-- Final data loading with upsert semantics
INSERT INTO customer_analytics (
  email_domain,
  registration_month, 
  customer_tier,
  activity_status,
  customer_count,
  avg_engagement_score,
  active_customers,
  new_customers,
  median_engagement,
  engagement_variance,
  top_customers,
  tier_metrics,
  last_updated,
  etl_run_id
)
SELECT 
  email_domain,
  registration_month,
  customer_tier, 
  activity_status,
  customer_count,
  ROUND(avg_engagement_score, 2),
  active_customers,
  new_customers,
  ROUND(median_engagement, 2),
  ROUND(engagement_variance, 2),
  top_customers,
  tier_metrics,
  CURRENT_TIMESTAMP,
  'etl_run_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
FROM aggregated_metrics
ON CONFLICT (email_domain, registration_month, customer_tier, activity_status)
DO UPDATE SET
  customer_count = EXCLUDED.customer_count,
  avg_engagement_score = EXCLUDED.avg_engagement_score,
  active_customers = EXCLUDED.active_customers,
  new_customers = EXCLUDED.new_customers,
  median_engagement = EXCLUDED.median_engagement,
  engagement_variance = EXCLUDED.engagement_variance,
  top_customers = EXCLUDED.top_customers,
  tier_metrics = EXCLUDED.tier_metrics,
  last_updated = EXCLUDED.last_updated,
  etl_run_id = EXCLUDED.etl_run_id;

-- Real-time streaming ETL with change data capture
CREATE OR REPLACE TRIGGER customer_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON customers
FOR EACH ROW
BEGIN
  -- Capture change event
  INSERT INTO customer_change_stream (
    change_type,
    customer_id,
    old_data,
    new_data,
    change_timestamp,
    change_sequence
  ) VALUES (
    TG_OP,  -- INSERT, UPDATE, or DELETE
    COALESCE(NEW.customer_id, OLD.customer_id),
    CASE WHEN TG_OP = 'DELETE' THEN ROW_TO_JSON(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN ROW_TO_JSON(NEW) ELSE NULL END,
    CURRENT_TIMESTAMP,
    nextval('change_sequence')
  );
  
  -- Trigger downstream processing
  PERFORM pg_notify('customer_changed', 
    JSON_BUILD_OBJECT(
      'operation', TG_OP,
      'customer_id', COALESCE(NEW.customer_id, OLD.customer_id),
      'timestamp', CURRENT_TIMESTAMP
    )::TEXT
  );
END;

-- Advanced window functions for trend analysis
WITH customer_trends AS (
  SELECT 
    customer_id,
    registration_date,
    engagement_score,
    
    -- Running totals and moving averages
    SUM(engagement_score) OVER (
      PARTITION BY email_domain 
      ORDER BY registration_date 
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_engagement,
    
    AVG(engagement_score) OVER (
      PARTITION BY customer_tier
      ORDER BY registration_date
      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) as moving_avg_engagement,
    
    -- Ranking and percentile calculations
    PERCENT_RANK() OVER (
      PARTITION BY registration_month 
      ORDER BY engagement_score
    ) as engagement_percentile,
    
    ROW_NUMBER() OVER (
      PARTITION BY email_domain, customer_tier 
      ORDER BY engagement_score DESC
    ) as tier_rank,
    
    -- Lead/Lag for sequential analysis
    LAG(engagement_score, 1) OVER (
      PARTITION BY customer_id 
      ORDER BY last_login_date
    ) as previous_engagement,
    
    -- First/Last value analytics
    FIRST_VALUE(engagement_score) OVER (
      PARTITION BY customer_id 
      ORDER BY registration_date 
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as initial_engagement
    
  FROM transformed_data
)

-- Pivot tables for cross-dimensional analysis
SELECT *
FROM (
  SELECT 
    registration_month,
    customer_tier,
    activity_status,
    customer_count
  FROM aggregated_metrics
) AS source_data
PIVOT (
  SUM(customer_count)
  FOR activity_status IN ('active', 'inactive', 'dormant')
) AS pivoted_activity;

-- Time-series analysis for trend detection
WITH monthly_trends AS (
  SELECT 
    DATE_TRUNC('month', registration_date) as month,
    customer_tier,
    COUNT(*) as registrations,
    AVG(engagement_score) as avg_engagement,
    
    -- Year-over-year comparisons
    LAG(COUNT(*), 12) OVER (
      PARTITION BY customer_tier 
      ORDER BY DATE_TRUNC('month', registration_date)
    ) as registrations_year_ago,
    
    -- Growth rate calculations
    CASE 
      WHEN LAG(COUNT(*), 1) OVER (
        PARTITION BY customer_tier 
        ORDER BY DATE_TRUNC('month', registration_date)
      ) > 0 THEN
        ROUND(
          ((COUNT(*)::FLOAT / LAG(COUNT(*), 1) OVER (
            PARTITION BY customer_tier 
            ORDER BY DATE_TRUNC('month', registration_date)
          )) - 1) * 100, 2
        )
      ELSE NULL
    END as month_over_month_growth
    
  FROM customers
  WHERE registration_date >= CURRENT_DATE - INTERVAL '24 months'
  GROUP BY DATE_TRUNC('month', registration_date), customer_tier
)

-- Data quality monitoring and validation
, quality_metrics AS (
  SELECT 
    'customers' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN email IS NULL OR email = '' THEN 1 END) as missing_email,
    COUNT(CASE WHEN first_name IS NULL OR first_name = '' THEN 1 END) as missing_first_name,
    COUNT(CASE WHEN email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN 1 END) as invalid_email,
    COUNT(CASE WHEN registration_date > CURRENT_DATE THEN 1 END) as future_registration,
    
    -- Data completeness percentage
    ROUND(
      (COUNT(*) - COUNT(CASE WHEN email IS NULL OR email = '' THEN 1 END)) * 100.0 / COUNT(*), 
      2
    ) as email_completeness_pct,
    
    -- Data freshness
    MAX(registration_date) as latest_registration,
    MIN(registration_date) as earliest_registration,
    EXTRACT(DAYS FROM (CURRENT_DATE - MAX(registration_date))) as days_since_last_record
    
  FROM customers
)

-- Output final results with data lineage tracking
SELECT 
  m.*,
  q.total_records,
  q.email_completeness_pct,
  q.days_since_last_record,
  'etl_pipeline_v2.1' as pipeline_version,
  CURRENT_TIMESTAMP as processed_at
FROM monthly_trends m
CROSS JOIN quality_metrics q
ORDER BY m.month DESC, m.customer_tier;

-- QueryLeaf automatically handles:
-- 1. MongoDB aggregation pipeline generation for complex SQL operations
-- 2. Nested document processing and JSON operations
-- 3. Change stream integration for real-time ETL
-- 4. Parallel processing and optimization for large datasets
-- 5. Error handling and data validation
-- 6. Integration with external systems and data formats
```

## ETL Monitoring and Management

### Performance Monitoring

Implement comprehensive ETL monitoring:

```javascript
// ETL monitoring and performance tracking service
class ETLMonitoringService {
  constructor(db) {
    this.db = db;
    this.metricsCollection = db.collection('etl_metrics');
    this.alertsCollection = db.collection('etl_alerts');
    this.performanceCollection = db.collection('etl_performance');
  }

  async trackPipelineExecution(pipelineId, executionMetadata) {
    const metrics = {
      pipeline_id: pipelineId,
      execution_id: executionMetadata.execution_id,
      start_time: executionMetadata.start_time,
      end_time: executionMetadata.end_time,
      duration_ms: executionMetadata.end_time - executionMetadata.start_time,
      status: executionMetadata.status,
      
      // Data volume metrics
      records_extracted: executionMetadata.records_extracted || 0,
      records_transformed: executionMetadata.records_transformed || 0,
      records_loaded: executionMetadata.records_loaded || 0,
      records_failed: executionMetadata.records_failed || 0,
      
      // Performance metrics
      extraction_duration_ms: executionMetadata.extraction_duration || 0,
      transformation_duration_ms: executionMetadata.transformation_duration || 0,
      loading_duration_ms: executionMetadata.loading_duration || 0,
      
      // Resource utilization
      memory_peak_mb: executionMetadata.memory_peak || 0,
      cpu_usage_percent: executionMetadata.cpu_usage || 0,
      disk_io_mb: executionMetadata.disk_io || 0,
      
      // Error information
      error_count: executionMetadata.errors?.length || 0,
      error_details: executionMetadata.errors || [],
      
      timestamp: new Date()
    };

    await this.metricsCollection.insertOne(metrics);
    
    // Check for performance anomalies
    await this.checkPerformanceAlerts(pipelineId, metrics);
    
    return metrics;
  }

  async generatePipelineReport(pipelineId, timeRange = 7) {
    const sinceDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
    
    const reportPipeline = [
      {
        $match: {
          pipeline_id: pipelineId,
          timestamp: { $gte: sinceDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
          },
          
          // Execution metrics
          total_executions: { $sum: 1 },
          successful_executions: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          failed_executions: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
          },
          
          // Duration statistics
          avg_duration_ms: { $avg: "$duration_ms" },
          max_duration_ms: { $max: "$duration_ms" },
          min_duration_ms: { $min: "$duration_ms" },
          
          // Data volume statistics
          total_records_processed: { $sum: "$records_transformed" },
          avg_records_per_execution: { $avg: "$records_transformed" },
          
          // Performance metrics
          avg_memory_usage_mb: { $avg: "$memory_peak_mb" },
          avg_cpu_usage: { $avg: "$cpu_usage_percent" },
          
          // Error analysis
          total_errors: { $sum: "$error_count" },
          unique_error_types: { $addToSet: "$error_details.error_type" }
        }
      },
      {
        $addFields: {
          success_rate: {
            $round: [
              { $multiply: [
                { $divide: ["$successful_executions", "$total_executions"] },
                100
              ]},
              2
            ]
          },
          throughput_records_per_minute: {
            $round: [
              { $divide: [
                "$avg_records_per_execution",
                { $divide: ["$avg_duration_ms", 60000] }
              ]},
              0
            ]
          }
        }
      },
      {
        $sort: { "_id.date": -1 }
      }
    ];

    const dailyMetrics = await this.metricsCollection.aggregate(reportPipeline).toArray();
    
    // Generate overall statistics
    const overallStats = await this.generateOverallStatistics(pipelineId, sinceDate);
    
    // Generate trend analysis
    const trendAnalysis = await this.generateTrendAnalysis(pipelineId, sinceDate);
    
    return {
      pipeline_id: pipelineId,
      report_period_days: timeRange,
      generated_at: new Date(),
      daily_metrics: dailyMetrics,
      overall_statistics: overallStats,
      trend_analysis: trendAnalysis,
      recommendations: await this.generateRecommendations(pipelineId, dailyMetrics, overallStats)
    };
  }

  async generateOverallStatistics(pipelineId, sinceDate) {
    const statsPipeline = [
      {
        $match: {
          pipeline_id: pipelineId,
          timestamp: { $gte: sinceDate }
        }
      },
      {
        $group: {
          _id: null,
          total_executions: { $sum: 1 },
          successful_executions: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          failed_executions: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
          },
          avg_duration_minutes: {
            $avg: { $divide: ["$duration_ms", 60000] }
          },
          total_records_processed: { $sum: "$records_transformed" },
          total_errors: { $sum: "$error_count" },
          
          // Performance percentiles
          duration_p50: { $percentile: { input: "$duration_ms", p: [0.5], method: 'approximate' } },
          duration_p95: { $percentile: { input: "$duration_ms", p: [0.95], method: 'approximate' } },
          duration_p99: { $percentile: { input: "$duration_ms", p: [0.99], method: 'approximate' } },
          
          memory_p95: { $percentile: { input: "$memory_peak_mb", p: [0.95], method: 'approximate' } },
          
          // First and last execution
          first_execution: { $min: "$timestamp" },
          last_execution: { $max: "$timestamp" }
        }
      },
      {
        $addFields: {
          success_rate: {
            $round: [
              { $multiply: [
                { $divide: ["$successful_executions", "$total_executions"] },
                100
              ]},
              2
            ]
          },
          avg_throughput_records_per_hour: {
            $round: [
              { $divide: [
                "$total_records_processed",
                { $divide: [
                  { $subtract: ["$last_execution", "$first_execution"] },
                  3600000  // Convert ms to hours
                ]}
              ]},
              0
            ]
          },
          error_rate: {
            $round: [
              { $multiply: [
                { $divide: ["$failed_executions", "$total_executions"] },
                100
              ]},
              2
            ]
          }
        }
      }
    ];

    const stats = await this.metricsCollection.aggregate(statsPipeline).toArray();
    return stats[0] || {};
  }

  async generateTrendAnalysis(pipelineId, sinceDate) {
    const trendPipeline = [
      {
        $match: {
          pipeline_id: pipelineId,
          timestamp: { $gte: sinceDate }
        }
      },
      {
        $group: {
          _id: {
            week: { $week: "$timestamp" },
            year: { $year: "$timestamp" }
          },
          avg_duration: { $avg: "$duration_ms" },
          avg_records_processed: { $avg: "$records_transformed" },
          success_rate: {
            $avg: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          execution_count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.week": 1 }
      },
      {
        $group: {
          _id: null,
          weekly_data: {
            $push: {
              week: "$_id.week",
              year: "$_id.year",
              avg_duration: "$avg_duration",
              avg_records: "$avg_records_processed",
              success_rate: "$success_rate",
              execution_count: "$execution_count"
            }
          }
        }
      },
      {
        $addFields: {
          // Calculate trends using linear regression approximation
          duration_trend: {
            $let: {
              vars: {
                n: { $size: "$weekly_data" },
                data: "$weekly_data"
              },
              in: {
                $cond: {
                  if: { $gte: ["$$n", 3] },
                  then: {
                    // Simple trend calculation (last value vs first value)
                    $subtract: [
                      { $arrayElemAt: ["$$data.avg_duration", -1] },
                      { $arrayElemAt: ["$$data.avg_duration", 0] }
                    ]
                  },
                  else: null
                }
              }
            }
          },
          performance_trend: {
            $let: {
              vars: {
                n: { $size: "$weekly_data" },
                data: "$weekly_data"
              },
              in: {
                $cond: {
                  if: { $gte: ["$$n", 3] },
                  then: {
                    $subtract: [
                      { $arrayElemAt: ["$$data.avg_records", -1] },
                      { $arrayElemAt: ["$$data.avg_records", 0] }
                    ]
                  },
                  else: null
                }
              }
            }
          }
        }
      }
    ];

    const trendData = await this.metricsCollection.aggregate(trendPipeline).toArray();
    return trendData[0] || { weekly_data: [], duration_trend: null, performance_trend: null };
  }

  async generateRecommendations(pipelineId, dailyMetrics, overallStats) {
    const recommendations = [];

    // Performance recommendations
    if (overallStats.success_rate < 95) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: `Pipeline success rate is ${overallStats.success_rate}%. Consider implementing error handling and retry logic.`,
        suggested_actions: [
          'Add retry mechanisms for transient failures',
          'Implement circuit breakers for external dependencies',
          'Add validation checks for input data quality'
        ]
      });
    }

    if (overallStats.avg_duration_minutes > 60) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: `Average execution time is ${Math.round(overallStats.avg_duration_minutes)} minutes. Consider optimization.`,
        suggested_actions: [
          'Implement parallel processing for transformation steps',
          'Optimize database queries and indexing',
          'Consider breaking pipeline into smaller, concurrent jobs'
        ]
      });
    }

    // Resource utilization recommendations
    if (overallStats.memory_p95 > 8000) {  // 8GB
      recommendations.push({
        type: 'resource',
        priority: 'medium',
        message: `Memory usage is high (95th percentile: ${Math.round(overallStats.memory_p95)}MB).`,
        suggested_actions: [
          'Implement streaming processing for large datasets',
          'Optimize data structures and reduce memory footprint',
          'Consider increasing available memory resources'
        ]
      });
    }

    // Data quality recommendations
    if (overallStats.error_rate > 5) {
      recommendations.push({
        type: 'data_quality',
        priority: 'high',
        message: `High error rate detected (${overallStats.error_rate}%).`,
        suggested_actions: [
          'Implement comprehensive data validation',
          'Add data profiling to identify quality issues',
          'Set up data quality monitoring dashboards'
        ]
      });
    }

    // Operational recommendations
    const recentFailures = dailyMetrics.filter(day => day.failed_executions > 0).length;
    if (recentFailures > dailyMetrics.length * 0.3) {
      recommendations.push({
        type: 'operational',
        priority: 'high',
        message: `Frequent failures detected in ${recentFailures} of the last ${dailyMetrics.length} days.`,
        suggested_actions: [
          'Set up real-time alerting for pipeline failures',
          'Implement automated recovery procedures',
          'Schedule regular pipeline health checks'
        ]
      });
    }

    return recommendations;
  }

  async checkPerformanceAlerts(pipelineId, currentMetrics) {
    // Define alert thresholds
    const alertThresholds = await this.getAlertThresholds(pipelineId);
    
    const alerts = [];

    // Duration alert
    if (currentMetrics.duration_ms > alertThresholds.max_duration_ms) {
      alerts.push({
        type: 'performance_degradation',
        severity: 'warning',
        message: `Pipeline execution took ${currentMetrics.duration_ms}ms, exceeding threshold of ${alertThresholds.max_duration_ms}ms`,
        metric_value: currentMetrics.duration_ms,
        threshold: alertThresholds.max_duration_ms
      });
    }

    // Failure rate alert
    if (currentMetrics.status === 'failed') {
      const recentFailures = await this.getRecentFailureCount(pipelineId, 24); // Last 24 hours
      if (recentFailures >= alertThresholds.max_failures_per_day) {
        alerts.push({
          type: 'high_failure_rate',
          severity: 'critical',
          message: `Pipeline has failed ${recentFailures} times in the last 24 hours`,
          metric_value: recentFailures,
          threshold: alertThresholds.max_failures_per_day
        });
      }
    }

    // Memory usage alert
    if (currentMetrics.memory_peak_mb > alertThresholds.max_memory_mb) {
      alerts.push({
        type: 'high_memory_usage',
        severity: 'warning',
        message: `Memory usage peaked at ${currentMetrics.memory_peak_mb}MB, exceeding threshold`,
        metric_value: currentMetrics.memory_peak_mb,
        threshold: alertThresholds.max_memory_mb
      });
    }

    // Data volume anomaly
    if (currentMetrics.records_transformed < alertThresholds.min_records_expected * 0.5) {
      alerts.push({
        type: 'low_data_volume',
        severity: 'warning',
        message: `Processed only ${currentMetrics.records_transformed} records, significantly below expected ${alertThresholds.min_records_expected}`,
        metric_value: currentMetrics.records_transformed,
        threshold: alertThresholds.min_records_expected
      });
    }

    // Store alerts
    for (const alert of alerts) {
      const alertDoc = {
        ...alert,
        pipeline_id: pipelineId,
        execution_id: currentMetrics.execution_id,
        timestamp: new Date(),
        status: 'active'
      };
      
      await this.alertsCollection.insertOne(alertDoc);
      
      // Send notifications
      await this.sendAlertNotification(alertDoc);
    }

    return alerts;
  }

  async getAlertThresholds(pipelineId) {
    // Get baseline performance metrics for threshold calculation
    const baseline = await this.metricsCollection.aggregate([
      {
        $match: {
          pipeline_id: pipelineId,
          status: 'completed',
          timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: null,
          avg_duration: { $avg: "$duration_ms" },
          p95_duration: { $percentile: { input: "$duration_ms", p: [0.95], method: 'approximate' } },
          avg_memory: { $avg: "$memory_peak_mb" },
          p95_memory: { $percentile: { input: "$memory_peak_mb", p: [0.95], method: 'approximate' } },
          avg_records: { $avg: "$records_transformed" }
        }
      }
    ]).toArray();

    if (baseline.length === 0) {
      // Default thresholds for new pipelines
      return {
        max_duration_ms: 3600000,  // 1 hour
        max_memory_mb: 4000,       // 4GB
        max_failures_per_day: 3,
        min_records_expected: 1000
      };
    }

    const stats = baseline[0];
    return {
      max_duration_ms: Math.max(stats.p95_duration * 1.5, stats.avg_duration * 2),
      max_memory_mb: Math.max(stats.p95_memory * 1.5, stats.avg_memory * 2),
      max_failures_per_day: 3,
      min_records_expected: Math.max(stats.avg_records * 0.1, 100)
    };
  }

  async getRecentFailureCount(pipelineId, hours) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await this.metricsCollection.countDocuments({
      pipeline_id: pipelineId,
      status: 'failed',
      timestamp: { $gte: since }
    });
    
    return result;
  }

  async sendAlertNotification(alert) {
    // Implement notification logic (email, Slack, PagerDuty, etc.)
    console.log('ALERT:', alert.message);
    
    // This would integrate with actual notification services
    // Example: await this.slackService.sendAlert(alert);
    // Example: await this.emailService.sendAlert(alert);
  }

  async getDashboardMetrics(pipelineIds = [], timeRange = 24) {
    const sinceDate = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    
    const matchStage = {
      timestamp: { $gte: sinceDate }
    };
    
    if (pipelineIds.length > 0) {
      matchStage.pipeline_id = { $in: pipelineIds };
    }

    const dashboardPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            pipeline_id: "$pipeline_id",
            hour: { $dateToString: { format: "%Y-%m-%d %H:00", date: "$timestamp" } }
          },
          executions: { $sum: 1 },
          successes: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          failures: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
          },
          avg_duration: { $avg: "$duration_ms" },
          total_records: { $sum: "$records_transformed" },
          total_errors: { $sum: "$error_count" }
        }
      },
      {
        $group: {
          _id: "$_id.pipeline_id",
          hourly_metrics: {
            $push: {
              hour: "$_id.hour",
              executions: "$executions",
              success_rate: {
                $round: [
                  { $multiply: [{ $divide: ["$successes", "$executions"] }, 100] },
                  1
                ]
              },
              avg_duration_minutes: { $round: [{ $divide: ["$avg_duration", 60000] }, 1] },
              total_records: "$total_records",
              total_errors: "$total_errors"
            }
          },
          total_executions: { $sum: "$executions" },
          overall_success_rate: {
            $round: [
              { $multiply: [
                { $divide: [{ $sum: "$successes" }, { $sum: "$executions" }] },
                100
              ]},
              1
            ]
          },
          total_records_processed: { $sum: "$total_records" },
          total_errors: { $sum: "$total_errors" }
        }
      },
      { $sort: { "_id": 1 } }
    ];

    const dashboardData = await this.metricsCollection.aggregate(dashboardPipeline).toArray();
    
    return {
      time_range_hours: timeRange,
      generated_at: new Date(),
      pipeline_metrics: dashboardData
    };
  }
}
```

## Best Practices for ETL Implementation

### ETL Design Principles

Essential guidelines for building robust ETL pipelines:

1. **Idempotency**: Design pipelines that can be safely re-run without side effects
2. **Error Handling**: Implement comprehensive error handling and recovery mechanisms  
3. **Data Validation**: Validate data quality at every stage of the pipeline
4. **Monitoring**: Track performance, data quality, and operational metrics
5. **Scalability**: Design for horizontal scaling and parallel processing
6. **Documentation**: Maintain clear documentation of data transformations and business logic

### Performance Optimization

Optimize ETL pipeline performance:

1. **Parallel Processing**: Use MongoDB's aggregation framework for concurrent data processing
2. **Incremental Loading**: Process only changed data to reduce processing time
3. **Index Optimization**: Create appropriate indexes for extraction and lookup operations
4. **Batch Size Tuning**: Optimize batch sizes for memory and throughput balance
5. **Resource Management**: Monitor and optimize CPU, memory, and I/O utilization
6. **Caching**: Cache frequently accessed reference data and transformation results

## QueryLeaf ETL Integration

QueryLeaf enables familiar SQL-style ETL development while leveraging MongoDB's powerful aggregation capabilities. This integration provides teams with the flexibility to implement complex data transformations using familiar SQL patterns while benefiting from MongoDB's document-oriented storage and processing advantages.

Key QueryLeaf ETL benefits include:

- **SQL Familiarity**: Write ETL logic using familiar SQL syntax and patterns
- **MongoDB Performance**: Leverage MongoDB's high-performance aggregation pipeline
- **Flexible Schema**: Handle semi-structured and evolving data schemas effortlessly
- **Real-Time Processing**: Integrate change streams for real-time ETL processing
- **Scalable Architecture**: Build ETL pipelines that scale horizontally with data growth

Whether you're migrating from traditional ETL tools or building new data processing workflows, MongoDB with QueryLeaf's SQL interface provides a powerful foundation for modern ETL architectures that can handle the complexity and scale requirements of contemporary data environments.

## Conclusion

MongoDB ETL and data pipeline processing capabilities provide enterprise-grade data transformation and processing infrastructure that addresses the challenges of modern data workflows. Combined with QueryLeaf's familiar SQL interface, MongoDB enables teams to build sophisticated ETL pipelines while preserving development patterns and query approaches they already understand.

The combination of MongoDB's flexible document model, powerful aggregation framework, and real-time change streams creates an ideal platform for handling diverse data sources, complex transformations, and scalable processing requirements. QueryLeaf's SQL-style syntax makes these capabilities accessible to broader development teams while maintaining the performance and flexibility advantages of MongoDB's native architecture.

Whether you're building batch ETL processes, real-time streaming pipelines, or hybrid architectures, MongoDB with QueryLeaf provides the tools and patterns necessary to implement robust, scalable, and maintainable data processing solutions that can adapt and evolve with your organization's growing data requirements.