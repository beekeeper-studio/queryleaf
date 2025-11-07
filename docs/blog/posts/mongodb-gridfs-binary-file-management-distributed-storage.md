---
title: "MongoDB GridFS: Advanced Binary File Management and Distributed Storage for Large-Scale Applications"
description: "Master MongoDB GridFS for large binary file storage and management. Learn advanced file streaming, metadata handling, distributed file systems, and SQL-familiar file operations for scalable enterprise applications."
date: 2025-11-06
tags: [mongodb, gridfs, file-storage, binary-data, streaming, distributed-systems, sql]
---

# MongoDB GridFS: Advanced Binary File Management and Distributed Storage for Large-Scale Applications

Modern applications require sophisticated file storage capabilities that can handle large binary files, support efficient streaming operations, and integrate seamlessly with existing data workflows while maintaining high availability and performance. Traditional file storage approaches often struggle with scenarios involving large files, distributed systems, metadata management, and the complexity of coordinating file operations with database transactions, leading to data inconsistency, performance bottlenecks, and operational complexity in production environments.

MongoDB GridFS provides comprehensive distributed file storage that automatically chunks large files, maintains file metadata, and integrates directly with MongoDB's distributed architecture and transaction capabilities. Unlike traditional file storage solutions that require separate file servers and complex synchronization logic, GridFS delivers unified file and data management through automatic file chunking, integrated metadata storage, and seamless integration with MongoDB's replication and sharding capabilities.

## The Traditional File Storage Challenge

Conventional file storage architectures face significant limitations when handling large files and distributed systems:

```sql
-- Traditional PostgreSQL file storage - complex management and limited scalability

-- Basic file metadata table with limited binary storage capabilities
CREATE TABLE file_metadata (
    file_id BIGSERIAL PRIMARY KEY,
    original_filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(200),
    file_size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- File organization
    directory_path VARCHAR(1000),
    file_category VARCHAR(100),
    
    -- User and access control
    uploaded_by BIGINT NOT NULL,
    access_level VARCHAR(20) DEFAULT 'private',
    
    -- File processing status
    processing_status VARCHAR(50) DEFAULT 'pending',
    thumbnail_generated BOOLEAN DEFAULT FALSE,
    virus_scan_status VARCHAR(50) DEFAULT 'pending',
    
    -- Storage location (external file system required)
    storage_path VARCHAR(1500) NOT NULL,
    storage_server VARCHAR(200),
    backup_locations TEXT[],
    
    -- File versioning (complex to implement)
    version_number INTEGER DEFAULT 1,
    parent_file_id BIGINT REFERENCES file_metadata(file_id),
    is_current_version BOOLEAN DEFAULT TRUE,
    
    -- Performance optimization fields
    download_count BIGINT DEFAULT 0,
    last_accessed TIMESTAMP,
    
    -- File integrity
    md5_hash VARCHAR(32),
    sha256_hash VARCHAR(64),
    
    -- Metadata for different file types
    image_metadata JSONB,
    document_metadata JSONB,
    video_metadata JSONB,
    
    CONSTRAINT valid_access_level CHECK (access_level IN ('public', 'private', 'shared', 'restricted')),
    CONSTRAINT valid_processing_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Complex indexing strategy for file management
CREATE INDEX idx_files_user_category ON file_metadata(uploaded_by, file_category, created_at DESC);
CREATE INDEX idx_files_directory ON file_metadata(directory_path, original_filename);
CREATE INDEX idx_files_size ON file_metadata(file_size_bytes DESC);
CREATE INDEX idx_files_type ON file_metadata(content_type, created_at DESC);
CREATE INDEX idx_files_processing ON file_metadata(processing_status, created_at);

-- File chunks table for large file handling (manual implementation required)
CREATE TABLE file_chunks (
    chunk_id BIGSERIAL PRIMARY KEY,
    file_id BIGINT NOT NULL REFERENCES file_metadata(file_id) ON DELETE CASCADE,
    chunk_number INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    chunk_data BYTEA NOT NULL, -- Limited to 1GB per field in PostgreSQL
    chunk_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(file_id, chunk_number)
);

CREATE INDEX idx_chunks_file_order ON file_chunks(file_id, chunk_number);

-- Complex file upload procedure with chunking logic
CREATE OR REPLACE FUNCTION upload_large_file(
    p_filename VARCHAR(500),
    p_content_type VARCHAR(200),
    p_file_data BYTEA,
    p_uploaded_by BIGINT,
    p_directory_path VARCHAR(1000) DEFAULT '/',
    p_chunk_size INTEGER DEFAULT 1048576 -- 1MB chunks
) RETURNS TABLE (
    file_id BIGINT,
    total_chunks INTEGER,
    upload_status VARCHAR(50),
    processing_time_ms INTEGER
) AS $$
DECLARE
    new_file_id BIGINT;
    file_size BIGINT;
    chunk_count INTEGER;
    chunk_data BYTEA;
    chunk_start INTEGER;
    chunk_end INTEGER;
    current_chunk INTEGER := 1;
    upload_start_time TIMESTAMP := clock_timestamp();
    file_hash VARCHAR(64);
BEGIN
    
    -- Calculate file size and hash
    file_size := LENGTH(p_file_data);
    file_hash := encode(digest(p_file_data, 'sha256'), 'hex');
    
    -- Insert file metadata
    INSERT INTO file_metadata (
        original_filename, content_type, file_size_bytes,
        uploaded_by, directory_path, storage_path,
        sha256_hash, processing_status
    ) VALUES (
        p_filename, p_content_type, file_size,
        p_uploaded_by, p_directory_path, 
        p_directory_path || '/' || p_filename,
        file_hash, 'processing'
    ) RETURNING file_metadata.file_id INTO new_file_id;
    
    -- Calculate number of chunks needed
    chunk_count := CEILING(file_size::DECIMAL / p_chunk_size);
    
    -- Process file in chunks (inefficient for large files)
    FOR current_chunk IN 1..chunk_count LOOP
        chunk_start := ((current_chunk - 1) * p_chunk_size) + 1;
        chunk_end := LEAST(current_chunk * p_chunk_size, file_size);
        
        -- Extract chunk data (memory intensive)
        chunk_data := SUBSTRING(p_file_data FROM chunk_start FOR (chunk_end - chunk_start + 1));
        
        -- Store chunk
        INSERT INTO file_chunks (
            file_id, chunk_number, chunk_size, chunk_data,
            chunk_hash
        ) VALUES (
            new_file_id, current_chunk, LENGTH(chunk_data), chunk_data,
            encode(digest(chunk_data, 'sha256'), 'hex')
        );
        
        -- Performance degradation with large number of chunks
        IF current_chunk % 100 = 0 THEN
            COMMIT; -- Partial commits to avoid long transactions
        END IF;
    END LOOP;
    
    -- Update file status
    UPDATE file_metadata 
    SET processing_status = 'completed', updated_at = CURRENT_TIMESTAMP
    WHERE file_metadata.file_id = new_file_id;
    
    RETURN QUERY SELECT 
        new_file_id,
        chunk_count,
        'completed'::VARCHAR(50),
        EXTRACT(MILLISECONDS FROM clock_timestamp() - upload_start_time)::INTEGER;
        
EXCEPTION WHEN OTHERS THEN
    -- Cleanup on failure
    DELETE FROM file_metadata WHERE file_metadata.file_id = new_file_id;
    RAISE EXCEPTION 'File upload failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Complex file download procedure with chunked retrieval
CREATE OR REPLACE FUNCTION download_file_chunks(
    p_file_id BIGINT,
    p_start_chunk INTEGER DEFAULT 1,
    p_end_chunk INTEGER DEFAULT NULL
) RETURNS TABLE (
    chunk_number INTEGER,
    chunk_data BYTEA,
    chunk_size INTEGER,
    is_final_chunk BOOLEAN
) AS $$
DECLARE
    total_chunks INTEGER;
    effective_end_chunk INTEGER;
BEGIN
    
    -- Get total number of chunks
    SELECT COUNT(*) INTO total_chunks
    FROM file_chunks 
    WHERE file_id = p_file_id;
    
    IF total_chunks = 0 THEN
        RAISE EXCEPTION 'File not found or has no chunks: %', p_file_id;
    END IF;
    
    -- Set effective end chunk
    effective_end_chunk := COALESCE(p_end_chunk, total_chunks);
    
    -- Return requested chunks (memory intensive for large ranges)
    RETURN QUERY
    SELECT 
        fc.chunk_number,
        fc.chunk_data,
        fc.chunk_size,
        fc.chunk_number = total_chunks as is_final_chunk
    FROM file_chunks fc
    WHERE fc.file_id = p_file_id
      AND fc.chunk_number BETWEEN p_start_chunk AND effective_end_chunk
    ORDER BY fc.chunk_number;
    
END;
$$ LANGUAGE plpgsql;

-- File streaming simulation with complex logic
CREATE OR REPLACE FUNCTION stream_file(
    p_file_id BIGINT,
    p_range_start BIGINT DEFAULT 0,
    p_range_end BIGINT DEFAULT NULL
) RETURNS TABLE (
    file_info JSONB,
    chunk_data BYTEA,
    content_range VARCHAR(100),
    total_size BIGINT
) AS $$
DECLARE
    file_record RECORD;
    chunk_size_bytes INTEGER := 1048576; -- 1MB chunks
    start_chunk INTEGER;
    end_chunk INTEGER;
    effective_range_end BIGINT;
    current_position BIGINT := 0;
    chunk_record RECORD;
BEGIN
    
    -- Get file metadata
    SELECT * INTO file_record
    FROM file_metadata fm
    WHERE fm.file_id = p_file_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'File not found: %', p_file_id;
    END IF;
    
    -- Calculate effective range
    effective_range_end := COALESCE(p_range_end, file_record.file_size_bytes - 1);
    
    -- Calculate chunk range
    start_chunk := (p_range_start / chunk_size_bytes) + 1;
    end_chunk := (effective_range_end / chunk_size_bytes) + 1;
    
    -- Return file info
    file_info := json_build_object(
        'file_id', file_record.file_id,
        'filename', file_record.original_filename,
        'content_type', file_record.content_type,
        'total_size', file_record.file_size_bytes,
        'range_start', p_range_start,
        'range_end', effective_range_end
    );
    
    -- Stream chunks (inefficient for large files)
    FOR chunk_record IN
        SELECT fc.chunk_number, fc.chunk_data, fc.chunk_size
        FROM file_chunks fc
        WHERE fc.file_id = p_file_id
          AND fc.chunk_number BETWEEN start_chunk AND end_chunk
        ORDER BY fc.chunk_number
    LOOP
        
        -- Calculate partial chunk data if needed
        IF chunk_record.chunk_number = start_chunk AND p_range_start % chunk_size_bytes != 0 THEN
            -- Partial first chunk
            chunk_data := SUBSTRING(
                chunk_record.chunk_data 
                FROM (p_range_start % chunk_size_bytes) + 1
            );
        ELSIF chunk_record.chunk_number = end_chunk AND effective_range_end % chunk_size_bytes != chunk_size_bytes - 1 THEN
            -- Partial last chunk
            chunk_data := SUBSTRING(
                chunk_record.chunk_data 
                FOR (effective_range_end % chunk_size_bytes) + 1
            );
        ELSE
            -- Full chunk
            chunk_data := chunk_record.chunk_data;
        END IF;
        
        content_range := format('bytes %s-%s/%s', 
            current_position, 
            current_position + LENGTH(chunk_data) - 1,
            file_record.file_size_bytes
        );
        
        total_size := file_record.file_size_bytes;
        
        current_position := current_position + LENGTH(chunk_data);
        
        RETURN NEXT;
    END LOOP;
    
END;
$$ LANGUAGE plpgsql;

-- Complex analytics query for file storage management
WITH file_storage_analysis AS (
    SELECT 
        file_category,
        content_type,
        DATE_TRUNC('month', created_at) as month_bucket,
        
        -- Storage utilization
        COUNT(*) as total_files,
        SUM(file_size_bytes) as total_storage_bytes,
        AVG(file_size_bytes) as avg_file_size,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY file_size_bytes) as median_file_size,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY file_size_bytes) as p95_file_size,
        
        -- Performance metrics
        AVG(download_count) as avg_downloads,
        SUM(download_count) as total_downloads,
        COUNT(*) FILTER (WHERE download_count = 0) as unused_files,
        
        -- Processing status
        COUNT(*) FILTER (WHERE processing_status = 'completed') as processed_files,
        COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_files,
        COUNT(*) FILTER (WHERE thumbnail_generated = true) as files_with_thumbnails,
        
        -- Storage efficiency
        COUNT(DISTINCT uploaded_by) as unique_uploaders,
        AVG(version_number) as avg_version_number
        
    FROM file_metadata
    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '12 months'
    GROUP BY file_category, content_type, DATE_TRUNC('month', created_at)
),

storage_growth_projection AS (
    SELECT 
        month_bucket,
        total_storage_bytes,
        
        -- Growth calculations (complex and expensive)
        LAG(total_storage_bytes) OVER (ORDER BY month_bucket) as prev_month_storage,
        (total_storage_bytes - LAG(total_storage_bytes) OVER (ORDER BY month_bucket))::DECIMAL / 
        NULLIF(LAG(total_storage_bytes) OVER (ORDER BY month_bucket), 0) * 100 as growth_percent
        
    FROM (
        SELECT 
            month_bucket,
            SUM(total_storage_bytes) as total_storage_bytes
        FROM file_storage_analysis
        GROUP BY month_bucket
    ) monthly_totals
)

SELECT 
    fsa.month_bucket,
    fsa.file_category,
    fsa.content_type,
    
    -- File statistics
    fsa.total_files,
    ROUND(fsa.total_storage_bytes / 1024.0 / 1024.0 / 1024.0, 2) as storage_gb,
    ROUND(fsa.avg_file_size / 1024.0 / 1024.0, 2) as avg_file_size_mb,
    ROUND(fsa.median_file_size / 1024.0 / 1024.0, 2) as median_file_size_mb,
    
    -- Usage patterns
    fsa.avg_downloads,
    fsa.total_downloads,
    ROUND((fsa.unused_files::DECIMAL / fsa.total_files) * 100, 1) as unused_files_percent,
    
    -- Processing efficiency
    ROUND((fsa.processed_files::DECIMAL / fsa.total_files) * 100, 1) as processing_success_rate,
    ROUND((fsa.files_with_thumbnails::DECIMAL / fsa.total_files) * 100, 1) as thumbnail_generation_rate,
    
    -- Growth metrics
    sgp.growth_percent as monthly_growth_percent,
    
    -- Storage recommendations
    CASE 
        WHEN fsa.unused_files::DECIMAL / fsa.total_files > 0.5 THEN 'implement_cleanup_policy'
        WHEN fsa.avg_file_size > 100 * 1024 * 1024 THEN 'consider_compression'
        WHEN sgp.growth_percent > 50 THEN 'monitor_storage_capacity'
        ELSE 'storage_optimized'
    END as storage_recommendation

FROM file_storage_analysis fsa
JOIN storage_growth_projection sgp ON DATE_TRUNC('month', fsa.month_bucket) = sgp.month_bucket
WHERE fsa.total_files > 0
ORDER BY fsa.month_bucket DESC, fsa.total_storage_bytes DESC;

-- Traditional file storage approach problems:
-- 1. Complex manual chunking implementation with performance limitations
-- 2. Separate metadata and binary data management requiring coordination
-- 3. Limited streaming capabilities and memory-intensive operations
-- 4. No built-in distributed storage or replication support
-- 5. Complex versioning and concurrent access management
-- 6. Expensive maintenance operations for large file collections
-- 7. No native integration with database transactions and consistency
-- 8. Limited file processing and metadata extraction capabilities
-- 9. Difficult backup and disaster recovery for large binary datasets
-- 10. Complex sharding and distribution strategies for file data
```

MongoDB GridFS provides comprehensive distributed file storage with automatic chunking and metadata management:

```javascript
// MongoDB GridFS - Advanced distributed file storage with automatic chunking and metadata management
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const fs = require('fs');
const crypto = require('crypto');
const { Transform, Readable } = require('stream');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('advanced_file_storage');

// Comprehensive MongoDB GridFS Manager
class AdvancedGridFSManager {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      // Default GridFS configuration
      defaultBucketName: config.defaultBucketName || 'fs',
      defaultChunkSizeBytes: config.defaultChunkSizeBytes || 255 * 1024, // 255KB
      
      // Performance optimization
      enableConcurrentUploads: config.enableConcurrentUploads !== false,
      maxConcurrentUploads: config.maxConcurrentUploads || 10,
      enableStreamOptimization: config.enableStreamOptimization !== false,
      bufferSize: config.bufferSize || 64 * 1024,
      
      // File processing features
      enableHashGeneration: config.enableHashGeneration !== false,
      enableMetadataExtraction: config.enableMetadataExtraction !== false,
      enableThumbnailGeneration: config.enableThumbnailGeneration !== false,
      enableContentAnalysis: config.enableContentAnalysis !== false,
      
      // Storage optimization
      enableCompression: config.enableCompression !== false,
      compressionLevel: config.compressionLevel || 6,
      enableDeduplication: config.enableDeduplication !== false,
      
      // Access control and security
      enableEncryption: config.enableEncryption !== false,
      encryptionKey: config.encryptionKey,
      enableAccessLogging: config.enableAccessLogging !== false,
      
      // Performance monitoring
      enablePerformanceMetrics: config.enablePerformanceMetrics !== false,
      enableUsageAnalytics: config.enableUsageAnalytics !== false,
      
      // Advanced features
      enableVersioning: config.enableVersioning !== false,
      enableDistributedStorage: config.enableDistributedStorage !== false,
      enableAutoCleanup: config.enableAutoCleanup !== false
    };
    
    // GridFS buckets for different file types
    this.buckets = new Map();
    this.uploadStreams = new Map();
    this.downloadStreams = new Map();
    
    // Performance tracking
    this.performanceMetrics = {
      totalUploads: 0,
      totalDownloads: 0,
      totalStorageBytes: 0,
      averageUploadTime: 0,
      averageDownloadTime: 0,
      errorCount: 0
    };
    
    // File processing queues
    this.processingQueue = new Map();
    this.thumbnailQueue = new Map();
    
    this.initializeGridFS();
  }

  async initializeGridFS() {
    console.log('Initializing advanced GridFS file storage system...');
    
    try {
      // Create specialized GridFS buckets for different file types
      await this.createOptimizedBucket('documents', {
        chunkSizeBytes: 512 * 1024, // 512KB chunks for documents
        metadata: {
          purpose: 'document_storage',
          contentTypes: ['application/pdf', 'application/msword', 'text/plain'],
          enableFullTextIndex: true,
          enableContentExtraction: true
        }
      });
      
      await this.createOptimizedBucket('images', {
        chunkSizeBytes: 256 * 1024, // 256KB chunks for images
        metadata: {
          purpose: 'image_storage',
          contentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
          enableThumbnailGeneration: true,
          enableImageAnalysis: true
        }
      });
      
      await this.createOptimizedBucket('videos', {
        chunkSizeBytes: 1024 * 1024, // 1MB chunks for videos
        metadata: {
          purpose: 'video_storage',
          contentTypes: ['video/mp4', 'video/webm', 'video/avi'],
          enableVideoProcessing: true,
          enableStreamingOptimization: true
        }
      });
      
      await this.createOptimizedBucket('archives', {
        chunkSizeBytes: 2 * 1024 * 1024, // 2MB chunks for archives
        metadata: {
          purpose: 'archive_storage',
          contentTypes: ['application/zip', 'application/tar', 'application/gzip'],
          enableCompression: false, // Already compressed
          enableIntegrityCheck: true
        }
      });
      
      // Create general-purpose bucket
      await this.createOptimizedBucket('general', {
        chunkSizeBytes: this.config.defaultChunkSizeBytes,
        metadata: {
          purpose: 'general_storage',
          enableGenericProcessing: true
        }
      });
      
      // Setup performance monitoring
      if (this.config.enablePerformanceMetrics) {
        await this.setupPerformanceMonitoring();
      }
      
      // Setup automatic cleanup
      if (this.config.enableAutoCleanup) {
        await this.setupAutomaticCleanup();
      }
      
      console.log('Advanced GridFS system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing GridFS:', error);
      throw error;
    }
  }

  async createOptimizedBucket(bucketName, options) {
    console.log(`Creating optimized GridFS bucket: ${bucketName}...`);
    
    try {
      const bucket = new GridFSBucket(this.db, {
        bucketName: bucketName,
        chunkSizeBytes: options.chunkSizeBytes || this.config.defaultChunkSizeBytes,
        writeConcern: { w: 1, j: true },
        readConcern: { level: 'majority' }
      });
      
      this.buckets.set(bucketName, {
        bucket: bucket,
        options: options,
        created: new Date(),
        stats: {
          fileCount: 0,
          totalSize: 0,
          uploadsInProgress: 0
        }
      });
      
      // Create optimized indexes for GridFS collections
      await this.createGridFSIndexes(bucketName);
      
      console.log(`GridFS bucket ${bucketName} created with ${options.chunkSizeBytes} byte chunks`);
      
    } catch (error) {
      console.error(`Error creating GridFS bucket ${bucketName}:`, error);
      throw error;
    }
  }

  async createGridFSIndexes(bucketName) {
    console.log(`Creating optimized indexes for GridFS bucket: ${bucketName}...`);
    
    try {
      // Files collection indexes
      const filesCollection = this.db.collection(`${bucketName}.files`);
      await filesCollection.createIndexes([
        { key: { filename: 1, uploadDate: -1 }, background: true, name: 'filename_upload_date' },
        { key: { 'metadata.contentType': 1, uploadDate: -1 }, background: true, name: 'content_type_date' },
        { key: { 'metadata.userId': 1, uploadDate: -1 }, background: true, sparse: true, name: 'user_files' },
        { key: { 'metadata.tags': 1 }, background: true, sparse: true, name: 'file_tags' },
        { key: { length: -1, uploadDate: -1 }, background: true, name: 'size_date' },
        { key: { 'metadata.hash': 1 }, background: true, sparse: true, name: 'file_hash' }
      ]);
      
      // Chunks collection indexes (automatically created by GridFS, but we can add custom ones)
      const chunksCollection = this.db.collection(`${bucketName}.chunks`);
      await chunksCollection.createIndexes([
        // Default GridFS index: { files_id: 1, n: 1 } is automatically created
        { key: { files_id: 1 }, background: true, name: 'chunks_file_id' }
      ]);
      
      console.log(`GridFS indexes created for bucket: ${bucketName}`);
      
    } catch (error) {
      console.error(`Error creating GridFS indexes for ${bucketName}:`, error);
      // Don't fail initialization for index creation issues
    }
  }

  async uploadFile(bucketName, filename, fileStream, metadata = {}) {
    console.log(`Starting file upload: ${filename} to bucket: ${bucketName}`);
    const uploadStartTime = Date.now();
    
    try {
      const bucketInfo = this.buckets.get(bucketName);
      if (!bucketInfo) {
        throw new Error(`GridFS bucket ${bucketName} not found`);
      }
      
      const bucket = bucketInfo.bucket;
      
      // Generate file hash for deduplication and integrity
      const hashStream = crypto.createHash('sha256');
      let fileSize = 0;
      
      // Enhanced metadata with automatic enrichment
      const enhancedMetadata = {
        ...metadata,
        
        // Upload context
        uploadedAt: new Date(),
        uploadedBy: metadata.userId || 'system',
        bucketName: bucketName,
        
        // File identification
        originalFilename: filename,
        contentType: metadata.contentType || this.detectContentType(filename),
        
        // Processing flags
        processingStatus: 'pending',
        processingQueue: [],
        
        // Access and security
        accessLevel: metadata.accessLevel || 'private',
        encryptionStatus: this.config.enableEncryption ? 'encrypted' : 'unencrypted',
        
        // File categorization
        category: this.categorizeFile(filename, metadata.contentType),
        tags: metadata.tags || [],
        
        // Version control
        version: metadata.version || 1,
        parentFileId: metadata.parentFileId,
        
        // System metadata
        source: metadata.source || 'api_upload',
        clientInfo: metadata.clientInfo || {},
        
        // Performance tracking
        uploadMetrics: {
          startTime: uploadStartTime,
          chunkSizeBytes: bucketInfo.options.chunkSizeBytes
        }
      };
      
      // Create upload stream with optimization
      const uploadOptions = {
        metadata: enhancedMetadata,
        chunkSizeBytes: bucketInfo.options.chunkSizeBytes,
        disableMD5: false // Enable MD5 for integrity checking
      };
      
      const uploadStream = bucket.openUploadStream(filename, uploadOptions);
      const uploadId = uploadStream.id.toString();
      
      // Track upload progress
      this.uploadStreams.set(uploadId, {
        stream: uploadStream,
        filename: filename,
        startTime: uploadStartTime,
        bucketName: bucketName
      });
      
      // Setup progress tracking and error handling
      let uploadedBytes = 0;
      
      return new Promise((resolve, reject) => {
        uploadStream.on('error', (error) => {
          console.error(`Upload error for ${filename}:`, error);
          this.uploadStreams.delete(uploadId);
          this.performanceMetrics.errorCount++;
          reject(error);
        });
        
        uploadStream.on('finish', async () => {
          const uploadTime = Date.now() - uploadStartTime;
          
          try {
            // Update file metadata with hash and final processing info
            const finalMetadata = {
              ...enhancedMetadata,
              
              // File integrity
              hash: hashStream.digest('hex'),
              fileSize: fileSize,
              
              // Upload completion
              processingStatus: 'uploaded',
              uploadMetrics: {
                ...enhancedMetadata.uploadMetrics,
                completedAt: new Date(),
                uploadTimeMs: uploadTime,
                throughputBytesPerSecond: fileSize > 0 ? Math.round(fileSize / (uploadTime / 1000)) : 0
              }
            };
            
            // Update the file document with enhanced metadata
            await this.db.collection(`${bucketName}.files`).updateOne(
              { _id: uploadStream.id },
              { 
                $set: { 
                  metadata: finalMetadata,
                  'metadata.hash': finalMetadata.hash,
                  'metadata.fileSize': finalMetadata.fileSize
                }
              }
            );
            
            // Update performance metrics
            this.updatePerformanceMetrics('upload', uploadTime, fileSize);
            bucketInfo.stats.fileCount++;
            bucketInfo.stats.totalSize += fileSize;
            
            // Queue for post-processing
            if (this.config.enableMetadataExtraction || this.config.enableThumbnailGeneration) {
              await this.queueFileProcessing(uploadStream.id, bucketName, finalMetadata);
            }
            
            this.uploadStreams.delete(uploadId);
            
            console.log(`File upload completed: ${filename} (${fileSize} bytes) in ${uploadTime}ms`);
            
            resolve({
              success: true,
              fileId: uploadStream.id,
              filename: filename,
              size: fileSize,
              hash: finalMetadata.hash,
              uploadTime: uploadTime,
              bucketName: bucketName,
              metadata: finalMetadata
            });
            
          } catch (error) {
            console.error('Error updating file metadata after upload:', error);
            reject(error);
          }
        });
        
        // Pipe the file stream through hash calculation and to GridFS
        fileStream.on('data', (chunk) => {
          hashStream.update(chunk);
          fileSize += chunk.length;
          uploadedBytes += chunk.length;
          
          // Report progress for large files
          if (uploadedBytes % (1024 * 1024) === 0) { // Every MB
            console.log(`Upload progress: ${filename} - ${Math.round(uploadedBytes / 1024 / 1024)}MB`);
          }
        });
        
        fileStream.pipe(uploadStream);
      });
      
    } catch (error) {
      console.error(`Error uploading file ${filename}:`, error);
      this.performanceMetrics.errorCount++;
      
      return {
        success: false,
        error: error.message,
        filename: filename,
        bucketName: bucketName
      };
    }
  }

  async downloadFile(bucketName, fileId, options = {}) {
    console.log(`Starting file download: ${fileId} from bucket: ${bucketName}`);
    const downloadStartTime = Date.now();
    
    try {
      const bucketInfo = this.buckets.get(bucketName);
      if (!bucketInfo) {
        throw new Error(`GridFS bucket ${bucketName} not found`);
      }
      
      const bucket = bucketInfo.bucket;
      const objectId = new ObjectId(fileId);
      
      // Get file metadata first
      const fileInfo = await this.db.collection(`${bucketName}.files`).findOne({ _id: objectId });
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`);
      }
      
      // Log access if enabled
      if (this.config.enableAccessLogging) {
        await this.logFileAccess(fileId, bucketName, 'download', options.userId);
      }
      
      // Create download stream with range support
      const downloadOptions = {};
      
      if (options.range) {
        downloadOptions.start = options.range.start || 0;
        downloadOptions.end = options.range.end || fileInfo.length - 1;
      }
      
      const downloadStream = bucket.openDownloadStream(objectId, downloadOptions);
      const downloadId = new ObjectId().toString();
      
      // Track download
      this.downloadStreams.set(downloadId, {
        stream: downloadStream,
        fileId: fileId,
        filename: fileInfo.filename,
        startTime: downloadStartTime,
        bucketName: bucketName
      });
      
      // Setup progress tracking
      let downloadedBytes = 0;
      
      downloadStream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        // Report progress for large files
        if (downloadedBytes % (1024 * 1024) === 0) { // Every MB
          console.log(`Download progress: ${fileInfo.filename} - ${Math.round(downloadedBytes / 1024 / 1024)}MB`);
        }
      });
      
      downloadStream.on('end', () => {
        const downloadTime = Date.now() - downloadStartTime;
        
        // Update metrics
        this.updatePerformanceMetrics('download', downloadTime, downloadedBytes);
        this.downloadStreams.delete(downloadId);
        
        console.log(`File download completed: ${fileInfo.filename} (${downloadedBytes} bytes) in ${downloadTime}ms`);
      });
      
      downloadStream.on('error', (error) => {
        console.error(`Download error for ${fileId}:`, error);
        this.downloadStreams.delete(downloadId);
        this.performanceMetrics.errorCount++;
      });
      
      return {
        success: true,
        fileId: fileId,
        filename: fileInfo.filename,
        contentType: fileInfo.metadata?.contentType || 'application/octet-stream',
        fileSize: fileInfo.length,
        downloadStream: downloadStream,
        metadata: fileInfo.metadata,
        bucketName: bucketName
      };
      
    } catch (error) {
      console.error(`Error downloading file ${fileId}:`, error);
      this.performanceMetrics.errorCount++;
      
      return {
        success: false,
        error: error.message,
        fileId: fileId,
        bucketName: bucketName
      };
    }
  }

  async streamFileRange(bucketName, fileId, rangeStart, rangeEnd, options = {}) {
    console.log(`Streaming file range: ${fileId} bytes ${rangeStart}-${rangeEnd}`);
    
    try {
      const bucketInfo = this.buckets.get(bucketName);
      if (!bucketInfo) {
        throw new Error(`GridFS bucket ${bucketName} not found`);
      }
      
      const bucket = bucketInfo.bucket;
      const objectId = new ObjectId(fileId);
      
      // Get file info for validation
      const fileInfo = await this.db.collection(`${bucketName}.files`).findOne({ _id: objectId });
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`);
      }
      
      // Validate range
      const fileSize = fileInfo.length;
      const validatedRangeStart = Math.max(0, rangeStart);
      const validatedRangeEnd = Math.min(rangeEnd || fileSize - 1, fileSize - 1);
      
      if (validatedRangeStart > validatedRangeEnd) {
        throw new Error('Invalid range: start position greater than end position');
      }
      
      // Create range download stream
      const downloadStream = bucket.openDownloadStream(objectId, {
        start: validatedRangeStart,
        end: validatedRangeEnd
      });
      
      // Log access
      if (this.config.enableAccessLogging) {
        await this.logFileAccess(fileId, bucketName, 'stream', options.userId, {
          rangeStart: validatedRangeStart,
          rangeEnd: validatedRangeEnd,
          rangeSize: validatedRangeEnd - validatedRangeStart + 1
        });
      }
      
      return {
        success: true,
        fileId: fileId,
        filename: fileInfo.filename,
        contentType: fileInfo.metadata?.contentType || 'application/octet-stream',
        totalSize: fileSize,
        rangeStart: validatedRangeStart,
        rangeEnd: validatedRangeEnd,
        rangeSize: validatedRangeEnd - validatedRangeStart + 1,
        downloadStream: downloadStream,
        contentRange: `bytes ${validatedRangeStart}-${validatedRangeEnd}/${fileSize}`
      };
      
    } catch (error) {
      console.error(`Error streaming file range for ${fileId}:`, error);
      return {
        success: false,
        error: error.message,
        fileId: fileId
      };
    }
  }

  async deleteFile(bucketName, fileId, options = {}) {
    console.log(`Deleting file: ${fileId} from bucket: ${bucketName}`);
    
    try {
      const bucketInfo = this.buckets.get(bucketName);
      if (!bucketInfo) {
        throw new Error(`GridFS bucket ${bucketName} not found`);
      }
      
      const bucket = bucketInfo.bucket;
      const objectId = new ObjectId(fileId);
      
      // Get file info before deletion (for logging and stats)
      const fileInfo = await this.db.collection(`${bucketName}.files`).findOne({ _id: objectId });
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`);
      }
      
      // Check permissions if needed
      if (options.userId && fileInfo.metadata?.uploadedBy !== options.userId) {
        if (!options.bypassPermissions) {
          throw new Error('Insufficient permissions to delete file');
        }
      }
      
      // Delete file and all associated chunks
      await bucket.delete(objectId);
      
      // Update bucket stats
      bucketInfo.stats.fileCount = Math.max(0, bucketInfo.stats.fileCount - 1);
      bucketInfo.stats.totalSize = Math.max(0, bucketInfo.stats.totalSize - fileInfo.length);
      
      // Log deletion
      if (this.config.enableAccessLogging) {
        await this.logFileAccess(fileId, bucketName, 'delete', options.userId, {
          filename: fileInfo.filename,
          fileSize: fileInfo.length,
          deletedBy: options.userId || 'system'
        });
      }
      
      console.log(`File deleted successfully: ${fileInfo.filename} (${fileInfo.length} bytes)`);
      
      return {
        success: true,
        fileId: fileId,
        filename: fileInfo.filename,
        fileSize: fileInfo.length,
        bucketName: bucketName
      };
      
    } catch (error) {
      console.error(`Error deleting file ${fileId}:`, error);
      this.performanceMetrics.errorCount++;
      
      return {
        success: false,
        error: error.message,
        fileId: fileId,
        bucketName: bucketName
      };
    }
  }

  async findFiles(bucketName, query = {}, options = {}) {
    console.log(`Searching files in bucket: ${bucketName}`);
    
    try {
      const bucketInfo = this.buckets.get(bucketName);
      if (!bucketInfo) {
        throw new Error(`GridFS bucket ${bucketName} not found`);
      }
      
      const filesCollection = this.db.collection(`${bucketName}.files`);
      
      // Build MongoDB query from search parameters
      const mongoQuery = {};
      
      if (query.filename) {
        mongoQuery.filename = new RegExp(query.filename, 'i');
      }
      
      if (query.contentType) {
        mongoQuery['metadata.contentType'] = query.contentType;
      }
      
      if (query.userId) {
        mongoQuery['metadata.uploadedBy'] = query.userId;
      }
      
      if (query.tags && query.tags.length > 0) {
        mongoQuery['metadata.tags'] = { $in: query.tags };
      }
      
      if (query.dateRange) {
        mongoQuery.uploadDate = {
          $gte: query.dateRange.start,
          $lte: query.dateRange.end || new Date()
        };
      }
      
      if (query.sizeRange) {
        mongoQuery.length = {};
        if (query.sizeRange.min) mongoQuery.length.$gte = query.sizeRange.min;
        if (query.sizeRange.max) mongoQuery.length.$lte = query.sizeRange.max;
      }
      
      // Configure query options
      const queryOptions = {
        sort: options.sort || { uploadDate: -1 },
        limit: options.limit || 100,
        skip: options.skip || 0,
        projection: options.includeMetadata ? {} : { 
          filename: 1, 
          length: 1, 
          uploadDate: 1, 
          'metadata.contentType': 1,
          'metadata.category': 1,
          'metadata.tags': 1
        }
      };
      
      // Execute query
      const files = await filesCollection.find(mongoQuery, queryOptions).toArray();
      const totalCount = await filesCollection.countDocuments(mongoQuery);
      
      return {
        success: true,
        files: files.map(file => ({
          fileId: file._id.toString(),
          filename: file.filename,
          contentType: file.metadata?.contentType,
          fileSize: file.length,
          uploadDate: file.uploadDate,
          category: file.metadata?.category,
          tags: file.metadata?.tags || [],
          hash: file.metadata?.hash,
          metadata: options.includeMetadata ? file.metadata : undefined
        })),
        totalCount: totalCount,
        currentPage: Math.floor((options.skip || 0) / (options.limit || 100)) + 1,
        totalPages: Math.ceil(totalCount / (options.limit || 100)),
        query: query,
        bucketName: bucketName
      };
      
    } catch (error) {
      console.error(`Error finding files in ${bucketName}:`, error);
      return {
        success: false,
        error: error.message,
        bucketName: bucketName
      };
    }
  }

  categorizeFile(filename, contentType) {
    // Intelligent file categorization
    const extension = filename.toLowerCase().split('.').pop();
    
    if (contentType) {
      if (contentType.startsWith('image/')) return 'image';
      if (contentType.startsWith('video/')) return 'video';
      if (contentType.startsWith('audio/')) return 'audio';
      if (contentType.includes('pdf')) return 'document';
      if (contentType.includes('text/')) return 'text';
    }
    
    // Extension-based categorization
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
    const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg'];
    const documentExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    const archiveExts = ['zip', 'tar', 'gz', 'rar', '7z'];
    
    if (imageExts.includes(extension)) return 'image';
    if (videoExts.includes(extension)) return 'video';
    if (audioExts.includes(extension)) return 'audio';
    if (documentExts.includes(extension)) return 'document';
    if (archiveExts.includes(extension)) return 'archive';
    
    return 'other';
  }

  detectContentType(filename) {
    // Simple content type detection based on extension
    const extension = filename.toLowerCase().split('.').pop();
    const contentTypes = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'png': 'image/png', 'gif': 'image/gif',
      'pdf': 'application/pdf',
      'txt': 'text/plain', 'html': 'text/html',
      'mp4': 'video/mp4', 'webm': 'video/webm',
      'mp3': 'audio/mpeg', 'wav': 'audio/wav',
      'zip': 'application/zip',
      'json': 'application/json'
    };
    
    return contentTypes[extension] || 'application/octet-stream';
  }

  async logFileAccess(fileId, bucketName, action, userId, additionalInfo = {}) {
    if (!this.config.enableAccessLogging) return;
    
    try {
      const accessLog = {
        fileId: new ObjectId(fileId),
        bucketName: bucketName,
        action: action, // upload, download, delete, stream
        userId: userId,
        timestamp: new Date(),
        ...additionalInfo,
        
        // System context
        userAgent: additionalInfo.userAgent,
        ipAddress: additionalInfo.ipAddress,
        sessionId: additionalInfo.sessionId,
        
        // Performance context
        responseTime: additionalInfo.responseTime,
        bytesTransferred: additionalInfo.bytesTransferred
      };
      
      await this.db.collection('file_access_logs').insertOne(accessLog);
      
    } catch (error) {
      console.error('Error logging file access:', error);
      // Don't fail the operation for logging errors
    }
  }

  updatePerformanceMetrics(operation, duration, bytes = 0) {
    if (!this.config.enablePerformanceMetrics) return;
    
    if (operation === 'upload') {
      this.performanceMetrics.totalUploads++;
      this.performanceMetrics.averageUploadTime = 
        (this.performanceMetrics.averageUploadTime + duration) / 2;
    } else if (operation === 'download') {
      this.performanceMetrics.totalDownloads++;
      this.performanceMetrics.averageDownloadTime = 
        (this.performanceMetrics.averageDownloadTime + duration) / 2;
    }
    
    this.performanceMetrics.totalStorageBytes += bytes;
  }

  async getStorageStats() {
    console.log('Gathering GridFS storage statistics...');
    
    const stats = {
      buckets: {},
      systemStats: this.performanceMetrics,
      summary: {
        totalBuckets: this.buckets.size,
        activeUploads: this.uploadStreams.size,
        activeDownloads: this.downloadStreams.size
      }
    };
    
    for (const [bucketName, bucketInfo] of this.buckets.entries()) {
      try {
        // Get collection statistics
        const filesCollection = this.db.collection(`${bucketName}.files`);
        const chunksCollection = this.db.collection(`${bucketName}.chunks`);
        
        const [filesStats, chunksStats, fileCount, totalSize] = await Promise.all([
          filesCollection.stats().catch(() => ({})),
          chunksCollection.stats().catch(() => ({})),
          filesCollection.countDocuments({}),
          filesCollection.aggregate([
            { $group: { _id: null, totalSize: { $sum: '$length' } } }
          ]).toArray()
        ]);
        
        stats.buckets[bucketName] = {
          configuration: bucketInfo.options,
          fileCount: fileCount,
          totalSizeBytes: totalSize[0]?.totalSize || 0,
          totalSizeMB: Math.round((totalSize[0]?.totalSize || 0) / 1024 / 1024),
          filesCollectionStats: {
            size: filesStats.size || 0,
            storageSize: filesStats.storageSize || 0,
            indexSize: filesStats.totalIndexSize || 0
          },
          chunksCollectionStats: {
            size: chunksStats.size || 0,
            storageSize: chunksStats.storageSize || 0,
            indexSize: chunksStats.totalIndexSize || 0
          },
          chunkSizeBytes: bucketInfo.options.chunkSizeBytes,
          averageFileSize: fileCount > 0 ? Math.round((totalSize[0]?.totalSize || 0) / fileCount) : 0,
          created: bucketInfo.created
        };
        
      } catch (error) {
        stats.buckets[bucketName] = {
          error: error.message,
          available: false
        };
      }
    }
    
    return stats;
  }

  async shutdown() {
    console.log('Shutting down GridFS manager...');
    
    // Close all active upload streams
    for (const [uploadId, uploadInfo] of this.uploadStreams.entries()) {
      try {
        uploadInfo.stream.destroy();
        console.log(`Closed upload stream: ${uploadId}`);
      } catch (error) {
        console.error(`Error closing upload stream ${uploadId}:`, error);
      }
    }
    
    // Close all active download streams
    for (const [downloadId, downloadInfo] of this.downloadStreams.entries()) {
      try {
        downloadInfo.stream.destroy();
        console.log(`Closed download stream: ${downloadId}`);
      } catch (error) {
        console.error(`Error closing download stream ${downloadId}:`, error);
      }
    }
    
    // Clear collections and metrics
    this.buckets.clear();
    this.uploadStreams.clear();
    this.downloadStreams.clear();
    
    console.log('GridFS manager shutdown complete');
  }
}

// Benefits of MongoDB GridFS:
// - Automatic file chunking for large files without manual implementation
// - Integrated metadata storage with file data for consistency
// - Native support for file streaming and range requests
// - Distributed storage with MongoDB's replication and sharding
// - ACID transactions for file operations with database consistency
// - Built-in indexing and querying capabilities for file metadata
// - Automatic chunk deduplication and storage optimization
// - Native backup and disaster recovery with MongoDB tooling
// - Seamless integration with existing MongoDB security and access control
// - SQL-compatible file operations through QueryLeaf integration

module.exports = {
  AdvancedGridFSManager
};
```

## Understanding MongoDB GridFS Architecture

### Advanced File Storage and Distribution Patterns

Implement sophisticated GridFS strategies for production MongoDB deployments:

```javascript
// Production-ready MongoDB GridFS with advanced optimization and enterprise features
class EnterpriseGridFSManager extends AdvancedGridFSManager {
  constructor(db, enterpriseConfig) {
    super(db, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      enableShardedStorage: true,
      enableAdvancedSecurity: true,
      enableContentDeliveryNetwork: true,
      enableAutoTiering: true,
      enableAdvancedAnalytics: true,
      enableComplianceFeatures: true
    };
    
    this.setupEnterpriseFeatures();
    this.initializeAdvancedSecurity();
    this.setupContentDeliveryNetwork();
  }

  async implementShardedFileStorage() {
    console.log('Implementing sharded GridFS storage...');
    
    const shardingStrategy = {
      // Shard key design for GridFS collections
      filesShardKey: { 'metadata.userId': 1, uploadDate: 1 },
      chunksShardKey: { files_id: 1 },
      
      // Distribution optimization
      enableZoneSharding: true,
      geographicDistribution: true,
      loadBalancing: true,
      
      // Performance optimization
      enableLocalReads: true,
      enableWriteDistribution: true,
      chunkDistributionStrategy: 'round_robin'
    };

    return await this.deployShardedGridFS(shardingStrategy);
  }

  async setupAdvancedContentDelivery() {
    console.log('Setting up advanced content delivery network...');
    
    const cdnConfig = {
      // Edge caching strategy
      edgeCaching: {
        enableEdgeNodes: true,
        cacheSize: '10GB',
        cacheTTL: 3600000, // 1 hour
        enableIntelligentCaching: true
      },
      
      // Content optimization
      contentOptimization: {
        enableImageOptimization: true,
        enableVideoTranscoding: true,
        enableCompressionOptimization: true,
        enableAdaptiveStreaming: true
      },
      
      // Global distribution
      globalDistribution: {
        enableMultiRegion: true,
        regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
        enableGeoRouting: true,
        enableFailover: true
      }
    };

    return await this.deployContentDeliveryNetwork(cdnConfig);
  }
}
```

## SQL-Style GridFS Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB GridFS operations and file management:

```sql
-- QueryLeaf GridFS operations with SQL-familiar syntax for MongoDB

-- Create GridFS buckets with SQL-style DDL
CREATE GRIDFS_BUCKET documents 
WITH (
  chunk_size = '512KB',
  write_concern = 'majority',
  read_concern = 'majority',
  enable_sharding = true
);

CREATE GRIDFS_BUCKET images
WITH (
  chunk_size = '256KB',
  enable_compression = true,
  enable_thumbnail_generation = true,
  content_types = ['image/jpeg', 'image/png', 'image/gif']
);

-- File upload with enhanced metadata
INSERT INTO GRIDFS('documents') (
  filename, content_type, file_data, metadata
) VALUES (
  'enterprise-report.pdf',
  'application/pdf', 
  FILE_STREAM('/path/to/enterprise-report.pdf'),
  JSON_OBJECT(
    'category', 'reports',
    'department', 'finance',
    'classification', 'internal',
    'tags', JSON_ARRAY('quarterly', 'financial', 'analysis'),
    'access_level', 'restricted',
    'retention_years', 7,
    'compliance_flags', JSON_OBJECT(
      'gdpr_applicable', true,
      'sox_applicable', true,
      'data_classification', 'sensitive'
    ),
    'business_context', JSON_OBJECT(
      'project_id', 'PROJ-2025-Q1',
      'cost_center', 'CC-FINANCE-001',
      'stakeholders', JSON_ARRAY('john.doe@company.com', 'jane.smith@company.com')
    )
  )
);

-- Bulk file upload with batch processing
INSERT INTO GRIDFS('images') (filename, content_type, file_data, metadata)
WITH file_batch AS (
  SELECT 
    original_filename as filename,
    detected_content_type as content_type,
    file_binary_data as file_data,
    
    -- Enhanced metadata generation
    JSON_OBJECT(
      'upload_batch_id', batch_id,
      'uploaded_by', uploader_user_id,
      'upload_source', upload_source,
      'original_path', original_file_path,
      
      -- Image-specific metadata
      'image_metadata', JSON_OBJECT(
        'width', image_width,
        'height', image_height,
        'format', image_format,
        'color_space', color_space,
        'has_transparency', has_alpha_channel,
        'camera_info', camera_metadata
      ),
      
      -- Processing instructions
      'processing_queue', JSON_ARRAY(
        'thumbnail_generation',
        'format_optimization',
        'metadata_extraction',
        'duplicate_detection'
      ),
      
      -- Organization
      'album_id', album_id,
      'event_date', event_date,
      'location', geo_location,
      'tags', detected_tags,
      
      -- Access control
      'visibility', photo_visibility,
      'sharing_permissions', sharing_rules,
      'privacy_level', privacy_setting
    ) as metadata
    
  FROM staging_images 
  WHERE processing_status = 'ready_for_upload'
    AND upload_date >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
)
SELECT filename, content_type, file_data, metadata
FROM file_batch
WHERE content_type LIKE 'image/%'

-- GridFS bulk upload configuration  
WITH UPLOAD_OPTIONS (
  concurrent_uploads = 10,
  chunk_size = '256KB',
  enable_deduplication = true,
  enable_virus_scanning = true,
  processing_priority = 'normal'
);

-- Query files with advanced filtering and metadata search
WITH file_search AS (
  SELECT 
    file_id,
    filename,
    upload_date,
    length as file_size_bytes,
    
    -- Extract metadata fields
    JSON_EXTRACT(metadata, '$.category') as category,
    JSON_EXTRACT(metadata, '$.department') as department,
    JSON_EXTRACT(metadata, '$.uploaded_by') as uploaded_by,
    JSON_EXTRACT(metadata, '$.tags') as tags,
    JSON_EXTRACT(metadata, '$.access_level') as access_level,
    JSON_EXTRACT(metadata, '$.content_type') as content_type,
    
    -- Calculate file age and size categories
    EXTRACT(DAYS FROM CURRENT_TIMESTAMP - upload_date) as age_days,
    CASE 
      WHEN length < 1024 * 1024 THEN 'small'
      WHEN length < 10 * 1024 * 1024 THEN 'medium'
      WHEN length < 100 * 1024 * 1024 THEN 'large'
      ELSE 'very_large'
    END as size_category,
    
    -- Access patterns
    JSON_EXTRACT(metadata, '$.download_count') as download_count,
    JSON_EXTRACT(metadata, '$.last_accessed') as last_accessed,
    
    -- Processing status
    JSON_EXTRACT(metadata, '$.processing_status') as processing_status,
    JSON_EXTRACT(metadata, '$.hash') as file_hash,
    
    -- Business context
    JSON_EXTRACT(metadata, '$.business_context.project_id') as project_id,
    JSON_EXTRACT(metadata, '$.business_context.cost_center') as cost_center
    
  FROM GRIDFS_FILES('documents')
  WHERE 
    -- Time-based filtering
    upload_date >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    
    -- Access level filtering (security)
    AND (
      JSON_EXTRACT(metadata, '$.access_level') = 'public'
      OR (
        JSON_EXTRACT(metadata, '$.access_level') = 'restricted' 
        AND CURRENT_USER_HAS_PERMISSION('restricted_files')
      )
      OR (
        JSON_EXTRACT(metadata, '$.uploaded_by') = CURRENT_USER_ID()
      )
    )
    
    -- Content filtering
    AND processing_status = 'completed'
    
  UNION ALL
  
  -- Include image files with different criteria
  SELECT 
    file_id,
    filename,
    upload_date,
    length as file_size_bytes,
    JSON_EXTRACT(metadata, '$.category') as category,
    'media' as department,
    JSON_EXTRACT(metadata, '$.uploaded_by') as uploaded_by,
    JSON_EXTRACT(metadata, '$.tags') as tags,
    JSON_EXTRACT(metadata, '$.visibility') as access_level,
    'image' as content_type,
    EXTRACT(DAYS FROM CURRENT_TIMESTAMP - upload_date) as age_days,
    CASE 
      WHEN length < 1024 * 1024 THEN 'small'
      WHEN length < 5 * 1024 * 1024 THEN 'medium' 
      WHEN length < 20 * 1024 * 1024 THEN 'large'
      ELSE 'very_large'
    END as size_category,
    COALESCE(JSON_EXTRACT(metadata, '$.view_count'), 0) as download_count,
    JSON_EXTRACT(metadata, '$.last_viewed') as last_accessed,
    JSON_EXTRACT(metadata, '$.processing_status') as processing_status,
    JSON_EXTRACT(metadata, '$.hash') as file_hash,
    JSON_EXTRACT(metadata, '$.album_id') as project_id,
    'MEDIA-STORAGE' as cost_center
    
  FROM GRIDFS_FILES('images')
  WHERE upload_date >= CURRENT_TIMESTAMP - INTERVAL '30 days'
),

usage_analytics AS (
  SELECT 
    fs.*,
    
    -- Usage classification
    CASE 
      WHEN download_count >= 100 THEN 'frequently_accessed'
      WHEN download_count >= 10 THEN 'moderately_accessed'
      WHEN download_count >= 1 THEN 'rarely_accessed'
      ELSE 'never_accessed'
    END as usage_pattern,
    
    -- Age-based classification
    CASE 
      WHEN age_days <= 7 THEN 'very_recent'
      WHEN age_days <= 30 THEN 'recent'
      WHEN age_days <= 90 THEN 'moderate_age'
      ELSE 'old'
    END as age_category,
    
    -- Storage optimization recommendations
    CASE 
      WHEN age_days > 365 AND download_count = 0 THEN 'candidate_for_archival'
      WHEN size_category = 'very_large' AND usage_pattern = 'never_accessed' THEN 'candidate_for_compression'
      WHEN age_days <= 30 AND usage_pattern = 'frequently_accessed' THEN 'hot_storage_candidate'
      ELSE 'standard_storage'
    END as storage_recommendation,
    
    -- Content insights
    ARRAY_LENGTH(
      STRING_TO_ARRAY(
        REPLACE(REPLACE(JSON_EXTRACT_TEXT(tags), '[', ''), ']', ''), 
        ','
      ), 
      1
    ) as tag_count,
    
    -- Cost analysis (estimated)
    CASE 
      WHEN size_category = 'small' THEN file_size_bytes * 0.000001  -- $0.001/GB/month
      WHEN size_category = 'medium' THEN file_size_bytes * 0.0000008
      WHEN size_category = 'large' THEN file_size_bytes * 0.0000005
      ELSE file_size_bytes * 0.0000003
    END as estimated_monthly_storage_cost
    
  FROM file_search fs
),

aggregated_insights AS (
  SELECT 
    department,
    category,
    content_type,
    age_category,
    usage_pattern,
    size_category,
    storage_recommendation,
    
    -- Volume metrics
    COUNT(*) as file_count,
    SUM(file_size_bytes) as total_size_bytes,
    AVG(file_size_bytes) as avg_file_size,
    
    -- Usage metrics
    SUM(download_count) as total_downloads,
    AVG(download_count) as avg_downloads_per_file,
    COUNT(*) FILTER (WHERE download_count = 0) as unused_files,
    
    -- Age distribution
    AVG(age_days) as avg_age_days,
    MIN(upload_date) as oldest_file_date,
    MAX(upload_date) as newest_file_date,
    
    -- Storage cost analysis
    SUM(estimated_monthly_storage_cost) as estimated_monthly_cost,
    
    -- Content analysis
    AVG(tag_count) as avg_tags_per_file,
    COUNT(DISTINCT uploaded_by) as unique_uploaders,
    COUNT(DISTINCT project_id) as unique_projects
    
  FROM usage_analytics
  GROUP BY 
    department, category, content_type, age_category, 
    usage_pattern, size_category, storage_recommendation
)

SELECT 
  -- Classification dimensions
  department,
  category,
  content_type,
  age_category,
  usage_pattern,
  size_category,
  
  -- Volume and size metrics
  file_count,
  ROUND(total_size_bytes / 1024.0 / 1024.0 / 1024.0, 2) as total_size_gb,
  ROUND(avg_file_size / 1024.0 / 1024.0, 2) as avg_file_size_mb,
  
  -- Usage analytics
  total_downloads,
  ROUND(avg_downloads_per_file, 1) as avg_downloads_per_file,
  unused_files,
  ROUND((unused_files::DECIMAL / file_count) * 100, 1) as unused_files_percent,
  
  -- Age and lifecycle
  ROUND(avg_age_days, 1) as avg_age_days,
  oldest_file_date,
  newest_file_date,
  
  -- Content insights
  ROUND(avg_tags_per_file, 1) as avg_tags_per_file,
  unique_uploaders,
  unique_projects,
  
  -- Cost optimization
  ROUND(estimated_monthly_cost, 4) as estimated_monthly_cost_usd,
  storage_recommendation,
  
  -- Actionable insights
  CASE storage_recommendation
    WHEN 'candidate_for_archival' THEN 'Move to cold storage or delete if no business value'
    WHEN 'candidate_for_compression' THEN 'Enable compression to reduce storage costs'
    WHEN 'hot_storage_candidate' THEN 'Ensure high-performance storage tier'
    ELSE 'Current storage tier appropriate'
  END as recommended_action,
  
  -- Priority scoring for action
  CASE 
    WHEN storage_recommendation = 'candidate_for_archival' AND unused_files_percent > 80 THEN 'high_priority'
    WHEN storage_recommendation = 'candidate_for_compression' AND total_size_gb > 10 THEN 'high_priority'
    WHEN storage_recommendation = 'hot_storage_candidate' AND avg_downloads_per_file > 50 THEN 'high_priority'
    WHEN unused_files_percent > 50 THEN 'medium_priority'
    ELSE 'low_priority'
  END as action_priority

FROM aggregated_insights
WHERE file_count > 0
ORDER BY 
  CASE action_priority
    WHEN 'high_priority' THEN 1
    WHEN 'medium_priority' THEN 2
    ELSE 3
  END,
  total_size_gb DESC,
  file_count DESC;

-- File streaming with range support and performance optimization
WITH file_stream_request AS (
  SELECT 
    file_id,
    filename,
    length as total_size,
    content_type,
    upload_date,
    
    -- Extract streaming metadata
    JSON_EXTRACT(metadata, '$.streaming_optimized') as streaming_optimized,
    JSON_EXTRACT(metadata, '$.cdn_enabled') as cdn_enabled,
    JSON_EXTRACT(metadata, '$.cache_headers') as cache_headers,
    
    -- Range request parameters (would be provided by application)
    $range_start as range_start,
    $range_end as range_end,
    
    -- Calculate effective range
    COALESCE($range_start, 0) as effective_start,
    COALESCE($range_end, length - 1) as effective_end,
    
    -- Streaming metadata
    JSON_EXTRACT(metadata, '$.video_metadata.duration') as video_duration,
    JSON_EXTRACT(metadata, '$.video_metadata.bitrate') as video_bitrate,
    JSON_EXTRACT(metadata, '$.image_metadata.width') as image_width,
    JSON_EXTRACT(metadata, '$.image_metadata.height') as image_height
    
  FROM GRIDFS_FILES('videos')
  WHERE file_id = $requested_file_id
)

SELECT 
  fsr.file_id,
  fsr.filename,
  fsr.content_type,
  fsr.total_size,
  
  -- Range information
  fsr.effective_start,
  fsr.effective_end,
  (fsr.effective_end - fsr.effective_start + 1) as range_size,
  
  -- Content headers for HTTP response
  'bytes ' || fsr.effective_start || '-' || fsr.effective_end || '/' || fsr.total_size as content_range_header,
  
  CASE 
    WHEN fsr.effective_start = 0 AND fsr.effective_end = fsr.total_size - 1 THEN '200'
    ELSE '206' -- Partial content
  END as http_status_code,
  
  -- Caching and performance headers
  CASE fsr.content_type
    WHEN 'image/jpeg' THEN 'public, max-age=2592000' -- 30 days
    WHEN 'image/png' THEN 'public, max-age=2592000'
    WHEN 'video/mp4' THEN 'public, max-age=3600' -- 1 hour
    WHEN 'application/pdf' THEN 'private, max-age=1800' -- 30 minutes
    ELSE 'private, max-age=300' -- 5 minutes
  END as cache_control_header,
  
  -- Streaming optimization flags
  fsr.streaming_optimized::BOOLEAN as is_streaming_optimized,
  fsr.cdn_enabled::BOOLEAN as use_cdn,
  
  -- Performance estimates
  CASE 
    WHEN fsr.video_bitrate IS NOT NULL THEN
      ROUND((fsr.effective_end - fsr.effective_start + 1) / (fsr.video_bitrate::DECIMAL * 1024 / 8), 2)
    ELSE NULL
  END as estimated_streaming_seconds,
  
  -- Content metadata for client
  JSON_OBJECT(
    'total_duration', fsr.video_duration,
    'bitrate_kbps', fsr.video_bitrate,
    'width', fsr.image_width,
    'height', fsr.image_height,
    'supports_range_requests', true,
    'chunk_size_optimized', true,
    'streaming_ready', fsr.streaming_optimized::BOOLEAN
  ) as content_metadata,
  
  -- GridFS streaming query (this would trigger the actual data retrieval)
  GRIDFS_STREAM(fsr.file_id, fsr.effective_start, fsr.effective_end) as file_stream

FROM file_stream_request fsr;

-- Advanced file analytics and storage optimization
WITH storage_utilization AS (
  SELECT 
    bucket_name,
    DATE_TRUNC('day', upload_date) as upload_day,
    
    -- Daily storage metrics
    COUNT(*) as daily_files,
    SUM(length) as daily_storage_bytes,
    AVG(length) as avg_file_size_daily,
    
    -- Content type distribution
    COUNT(*) FILTER (WHERE JSON_EXTRACT(metadata, '$.content_type') LIKE 'image/%') as image_files,
    COUNT(*) FILTER (WHERE JSON_EXTRACT(metadata, '$.content_type') LIKE 'video/%') as video_files,
    COUNT(*) FILTER (WHERE JSON_EXTRACT(metadata, '$.content_type') LIKE 'application/%') as document_files,
    
    -- Processing status
    COUNT(*) FILTER (WHERE JSON_EXTRACT(metadata, '$.processing_status') = 'completed') as processed_files,
    COUNT(*) FILTER (WHERE JSON_EXTRACT(metadata, '$.processing_status') = 'failed') as failed_files,
    
    -- Access patterns
    SUM(COALESCE(JSON_EXTRACT(metadata, '$.download_count')::INTEGER, 0)) as total_downloads,
    AVG(COALESCE(JSON_EXTRACT(metadata, '$.download_count')::INTEGER, 0)) as avg_downloads_per_file
    
  FROM (
    SELECT 'documents' as bucket_name, file_id, filename, length, upload_date, metadata 
    FROM GRIDFS_FILES('documents')
    UNION ALL
    SELECT 'images' as bucket_name, file_id, filename, length, upload_date, metadata 
    FROM GRIDFS_FILES('images') 
    UNION ALL
    SELECT 'videos' as bucket_name, file_id, filename, length, upload_date, metadata 
    FROM GRIDFS_FILES('videos')
  ) all_files
  WHERE upload_date >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY bucket_name, DATE_TRUNC('day', upload_date)
),

performance_analysis AS (
  SELECT 
    su.*,
    
    -- Growth analysis
    LAG(daily_storage_bytes) OVER (
      PARTITION BY bucket_name 
      ORDER BY upload_day
    ) as prev_day_storage,
    
    -- Calculate growth rate
    CASE 
      WHEN LAG(daily_storage_bytes) OVER (PARTITION BY bucket_name ORDER BY upload_day) > 0 THEN
        ROUND(
          ((daily_storage_bytes - LAG(daily_storage_bytes) OVER (PARTITION BY bucket_name ORDER BY upload_day))::DECIMAL / 
           LAG(daily_storage_bytes) OVER (PARTITION BY bucket_name ORDER BY upload_day)) * 100, 
          1
        )
      ELSE NULL
    END as storage_growth_percent,
    
    -- Performance indicators
    ROUND(daily_storage_bytes / NULLIF(daily_files, 0) / 1024.0 / 1024.0, 2) as avg_file_size_mb,
    ROUND(total_downloads::DECIMAL / NULLIF(daily_files, 0), 2) as download_ratio,
    
    -- Processing efficiency
    ROUND((processed_files::DECIMAL / NULLIF(daily_files, 0)) * 100, 1) as processing_success_rate,
    ROUND((failed_files::DECIMAL / NULLIF(daily_files, 0)) * 100, 1) as processing_failure_rate,
    
    -- Storage efficiency indicators
    CASE 
      WHEN avg_downloads_per_file = 0 THEN 'unused_storage'
      WHEN avg_downloads_per_file < 0.1 THEN 'low_utilization'
      WHEN avg_downloads_per_file < 1.0 THEN 'moderate_utilization'
      ELSE 'high_utilization'
    END as utilization_category
    
  FROM storage_utilization su
)

SELECT 
  bucket_name,
  upload_day,
  
  -- Volume metrics
  daily_files,
  ROUND(daily_storage_bytes / 1024.0 / 1024.0 / 1024.0, 3) as daily_storage_gb,
  avg_file_size_mb,
  
  -- Content distribution
  image_files,
  video_files,
  document_files,
  
  -- Performance metrics
  processing_success_rate,
  processing_failure_rate,
  download_ratio,
  utilization_category,
  
  -- Growth analysis
  storage_growth_percent,
  
  -- Optimization recommendations
  CASE 
    WHEN utilization_category = 'unused_storage' THEN 'implement_retention_policy'
    WHEN processing_failure_rate > 10 THEN 'investigate_processing_issues'
    WHEN storage_growth_percent > 100 THEN 'monitor_storage_capacity'
    WHEN avg_file_size_mb > 100 THEN 'consider_compression_optimization'
    ELSE 'storage_operating_normally'
  END as optimization_recommendation,
  
  -- Projected storage (simple linear projection)
  CASE 
    WHEN storage_growth_percent IS NOT NULL THEN
      ROUND(
        daily_storage_bytes * (1 + storage_growth_percent / 100) * 30 / 1024.0 / 1024.0 / 1024.0, 
        2
      )
    ELSE NULL
  END as projected_monthly_storage_gb,
  
  -- Alert conditions
  CASE 
    WHEN processing_failure_rate > 20 THEN 'critical_processing_failure'
    WHEN storage_growth_percent > 200 THEN 'critical_storage_growth'
    WHEN utilization_category = 'unused_storage' AND daily_storage_gb > 1 THEN 'storage_waste_alert'
    ELSE 'normal_operations'
  END as alert_status

FROM performance_analysis
WHERE daily_files > 0
ORDER BY 
  CASE alert_status
    WHEN 'critical_processing_failure' THEN 1
    WHEN 'critical_storage_growth' THEN 2
    WHEN 'storage_waste_alert' THEN 3
    ELSE 4
  END,
  bucket_name,
  upload_day DESC;

-- QueryLeaf provides comprehensive GridFS capabilities:
-- 1. SQL-familiar GridFS bucket creation and management
-- 2. Advanced file upload with metadata enrichment and batch processing
-- 3. Efficient file querying with metadata search and filtering
-- 4. High-performance file streaming with range request support
-- 5. Comprehensive storage analytics and optimization recommendations
-- 6. Integration with MongoDB's native GridFS optimizations
-- 7. Advanced access control and security features
-- 8. SQL-style operations for complex file management workflows
-- 9. Built-in performance monitoring and capacity planning
-- 10. Enterprise-ready file storage with distributed capabilities
```

## Best Practices for GridFS Implementation

### File Storage Strategy and Performance Optimization

Essential principles for effective MongoDB GridFS deployment:

1. **Chunk Size Optimization**: Choose chunk sizes based on file types and access patterns - smaller chunks for random access, larger chunks for sequential streaming
2. **Bucket Organization**: Create separate buckets for different file types to optimize chunk sizes and indexing strategies
3. **Metadata Design**: Implement comprehensive metadata schemas that support efficient querying and business requirements
4. **Index Strategy**: Create strategic indexes on frequently queried metadata fields while avoiding over-indexing
5. **Security Integration**: Implement access control and encryption that integrates with application security frameworks
6. **Performance Monitoring**: Track upload/download performance, storage utilization, and access patterns for optimization

### Production Deployment and Operational Excellence

Design GridFS systems for enterprise-scale requirements:

1. **Distributed Architecture**: Implement GridFS across sharded clusters with proper shard key design for balanced distribution
2. **Backup and Recovery**: Design backup strategies that account for GridFS's dual-collection structure (files and chunks)
3. **Content Delivery**: Integrate with CDN and caching layers for optimal global content delivery performance
4. **Storage Tiering**: Implement automated data lifecycle management with hot, warm, and cold storage tiers
5. **Compliance Features**: Build in data governance, audit trails, and regulatory compliance capabilities
6. **Monitoring and Alerting**: Establish comprehensive monitoring for storage utilization, performance, and system health

## Conclusion

MongoDB GridFS provides comprehensive distributed file storage that eliminates the complexity of traditional file management systems through automatic chunking, integrated metadata storage, and seamless integration with MongoDB's distributed architecture. The unified approach to file and database operations enables sophisticated file management workflows while maintaining ACID properties and enterprise-grade reliability.

Key MongoDB GridFS benefits include:

- **Automatic Chunking**: Seamless handling of large files without manual chunk management or size limitations
- **Integrated Metadata**: Rich metadata storage with file data for complex querying and business logic integration
- **Distributed Storage**: Native support for MongoDB's replication and sharding for global file distribution
- **Streaming Capabilities**: Efficient file streaming and range requests for multimedia and large file applications
- **Transaction Support**: ACID transactions for file operations integrated with database consistency guarantees
- **SQL Accessibility**: Familiar SQL-style file operations through QueryLeaf for accessible enterprise file management

Whether you're building content management systems, media platforms, document repositories, or enterprise file storage solutions, MongoDB GridFS with QueryLeaf's familiar SQL interface provides the foundation for scalable, reliable, and feature-rich file storage architectures.

> **QueryLeaf Integration**: QueryLeaf seamlessly manages MongoDB GridFS operations while providing SQL-familiar syntax for file uploads, downloads, streaming, and metadata management. Advanced file storage patterns including distributed storage, content delivery, and enterprise security features are elegantly handled through familiar SQL constructs, making sophisticated file management both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust GridFS capabilities with SQL-style file operations makes it an ideal platform for applications requiring both advanced file storage functionality and familiar database interaction patterns, ensuring your file storage infrastructure can scale efficiently while maintaining operational simplicity and developer productivity.