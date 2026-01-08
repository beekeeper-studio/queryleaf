---
title: "MongoDB GridFS for Large File Storage and Management: SQL-Style File Operations and Binary Data Handling"
description: "Master MongoDB GridFS for storing and managing large files, binary data, and multimedia content. Learn efficient file operations, metadata management, and SQL-compatible file queries for modern applications."
date: 2026-01-07
tags: [mongodb, gridfs, file-storage, binary-data, multimedia, sql, file-management]
---

# MongoDB GridFS for Large File Storage and Management: SQL-Style File Operations and Binary Data Handling

Modern applications frequently need to handle large files, multimedia content, binary data, and document attachments that exceed traditional database storage limitations. Whether you're building content management systems, media libraries, document repositories, or data archival platforms, efficient large file storage and retrieval becomes critical for application performance and user experience.

Traditional relational databases struggle with large binary data storage, often requiring complex external storage solutions, fragmented file management approaches, and intricate metadata synchronization. MongoDB GridFS provides a comprehensive solution for storing and managing files larger than the 16MB BSON document size limit while maintaining the benefits of database-integrated storage, atomic operations, and familiar query patterns.

## The Large File Storage Challenge

Traditional database approaches to file storage face significant limitations:

```sql
-- PostgreSQL large file storage - complex and limited binary data handling

-- Basic file storage table with bytea limitations (limited to available memory)
CREATE TABLE file_storage (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    file_data BYTEA, -- Limited by available memory, inefficient for large files
    upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Basic metadata
    description TEXT,
    tags TEXT[],
    category VARCHAR(50),
    is_public BOOLEAN DEFAULT false,
    
    -- File characteristics
    file_hash VARCHAR(64), -- For duplicate detection
    original_filename VARCHAR(255),
    compression_type VARCHAR(20),
    
    CONSTRAINT check_file_size CHECK (file_size > 0 AND file_size <= 1073741824) -- 1GB limit
);

-- Large object storage approach (pg_largeobject) - complex management
CREATE TABLE file_metadata (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    large_object_oid OID NOT NULL, -- Reference to pg_largeobject
    upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    description TEXT,
    tags TEXT[],
    category VARCHAR(50),
    is_public BOOLEAN DEFAULT false,
    file_hash VARCHAR(64),
    
    -- Complex management required
    CONSTRAINT check_file_size CHECK (file_size > 0)
);

-- File chunks table for manual chunking (complex to manage)
CREATE TABLE file_chunks (
    chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES file_metadata(file_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_data BYTEA NOT NULL,
    chunk_size INTEGER NOT NULL,
    checksum VARCHAR(32),
    
    UNIQUE(file_id, chunk_index)
);

-- Complex file upload process with manual chunking
CREATE OR REPLACE FUNCTION upload_file_chunked(
    p_filename VARCHAR(255),
    p_content_type VARCHAR(100),
    p_file_data BYTEA,
    p_created_by UUID,
    p_chunk_size INTEGER DEFAULT 262144 -- 256KB chunks
) RETURNS UUID AS $$
DECLARE
    v_file_id UUID;
    v_file_size BIGINT;
    v_chunk_count INTEGER;
    v_chunk_data BYTEA;
    v_offset INTEGER := 1;
    v_chunk_index INTEGER := 0;
    v_current_chunk_size INTEGER;
BEGIN
    -- Get file size
    v_file_size := LENGTH(p_file_data);
    v_chunk_count := CEIL(v_file_size::DECIMAL / p_chunk_size);
    
    -- Insert file metadata
    INSERT INTO file_metadata (filename, content_type, file_size, large_object_oid, created_by)
    VALUES (p_filename, p_content_type, v_file_size, 0, p_created_by) -- Placeholder OID
    RETURNING file_id INTO v_file_id;
    
    -- Insert chunks
    WHILE v_offset <= v_file_size LOOP
        v_current_chunk_size := LEAST(p_chunk_size, v_file_size - v_offset + 1);
        v_chunk_data := SUBSTRING(p_file_data FROM v_offset FOR v_current_chunk_size);
        
        INSERT INTO file_chunks (file_id, chunk_index, chunk_data, chunk_size, checksum)
        VALUES (
            v_file_id, 
            v_chunk_index, 
            v_chunk_data, 
            v_current_chunk_size,
            MD5(v_chunk_data)
        );
        
        v_offset := v_offset + p_chunk_size;
        v_chunk_index := v_chunk_index + 1;
    END LOOP;
    
    RETURN v_file_id;
END;
$$ LANGUAGE plpgsql;

-- Complex file retrieval with manual chunk reassembly
CREATE OR REPLACE FUNCTION download_file_chunked(p_file_id UUID)
RETURNS BYTEA AS $$
DECLARE
    v_file_data BYTEA := '';
    v_chunk RECORD;
BEGIN
    -- Reassemble file from chunks
    FOR v_chunk IN 
        SELECT chunk_data 
        FROM file_chunks 
        WHERE file_id = p_file_id 
        ORDER BY chunk_index
    LOOP
        v_file_data := v_file_data || v_chunk.chunk_data;
    END LOOP;
    
    RETURN v_file_data;
END;
$$ LANGUAGE plpgsql;

-- File search with basic metadata queries (limited functionality)
WITH file_search AS (
    SELECT 
        fm.file_id,
        fm.filename,
        fm.content_type,
        fm.file_size,
        fm.upload_timestamp,
        fm.created_by,
        fm.description,
        fm.tags,
        fm.category,
        
        -- Basic relevance scoring (very limited)
        CASE 
            WHEN LOWER(fm.filename) LIKE '%search_term%' THEN 3
            WHEN LOWER(fm.description) LIKE '%search_term%' THEN 2  
            WHEN 'search_term' = ANY(fm.tags) THEN 2
            ELSE 1
        END as relevance_score,
        
        -- File size categorization
        CASE 
            WHEN fm.file_size < 1048576 THEN 'Small (< 1MB)'
            WHEN fm.file_size < 10485760 THEN 'Medium (1-10MB)'
            WHEN fm.file_size < 104857600 THEN 'Large (10-100MB)'
            ELSE 'Very Large (> 100MB)'
        END as size_category,
        
        -- Check if file exists (chunks available)
        EXISTS(
            SELECT 1 FROM file_chunks fc WHERE fc.file_id = fm.file_id
        ) as file_available,
        
        -- Get chunk count for integrity verification
        (
            SELECT COUNT(*) FROM file_chunks fc WHERE fc.file_id = fm.file_id
        ) as chunk_count
        
    FROM file_metadata fm
    WHERE 
        (
            LOWER(fm.filename) LIKE '%search_term%' OR
            LOWER(fm.description) LIKE '%search_term%' OR  
            'search_term' = ANY(fm.tags)
        )
        AND fm.is_public = true
),
file_stats AS (
    SELECT 
        COUNT(*) as total_files,
        SUM(fs.file_size) as total_storage_used,
        AVG(fs.file_size) as avg_file_size,
        COUNT(*) FILTER (WHERE fs.file_available = false) as corrupted_files
    FROM file_search fs
)
SELECT 
    fs.file_id,
    fs.filename,
    fs.content_type,
    pg_size_pretty(fs.file_size) as formatted_size,
    fs.size_category,
    fs.upload_timestamp,
    u.name as uploaded_by,
    fs.description,
    fs.tags,
    fs.relevance_score,
    fs.file_available,
    fs.chunk_count,
    
    -- Download URL (requires application logic for reassembly)
    '/api/files/' || fs.file_id || '/download' as download_url,
    
    -- File status
    CASE 
        WHEN NOT fs.file_available THEN 'Missing/Corrupted'
        WHEN fs.chunk_count = 0 THEN 'Empty File'
        ELSE 'Available'
    END as file_status,
    
    -- Storage efficiency warning
    CASE 
        WHEN fs.chunk_count > 1000 THEN 'High fragmentation - consider optimization'
        ELSE 'Normal'
    END as storage_health
    
FROM file_search fs
JOIN users u ON fs.created_by = u.user_id
CROSS JOIN file_stats fst
WHERE fs.file_available = true
ORDER BY fs.relevance_score DESC, fs.upload_timestamp DESC
LIMIT 50;

-- Problems with traditional file storage approaches:
-- 1. Memory limitations with BYTEA for large files
-- 2. Complex manual chunking and reassembly processes
-- 3. No built-in file streaming or partial reads
-- 4. Limited metadata integration and search capabilities
-- 5. No automatic integrity checking or corruption detection
-- 6. Poor performance with large binary data operations
-- 7. Complex backup and replication scenarios
-- 8. No built-in compression or storage optimization
-- 9. Difficult scaling with growing file storage requirements
-- 10. Manual transaction management for file operations
-- 11. No streaming uploads or downloads
-- 12. Limited duplicate detection and deduplication
-- 13. Complex permission and access control implementation
-- 14. Poor integration with application object models
-- 15. No automatic metadata extraction capabilities
```

MongoDB GridFS provides comprehensive file storage capabilities:

```javascript
// MongoDB GridFS - comprehensive large file storage with built-in optimization
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const client = new MongoClient('mongodb+srv://username:password@cluster.mongodb.net');
const db = client.db('file_storage_platform');

// Advanced GridFS file management system
class AdvancedGridFSManager {
  constructor(db, options = {}) {
    this.db = db;
    this.buckets = new Map();
    
    // Default bucket for general files
    this.defaultBucket = new GridFSBucket(db, {
      bucketName: 'files',
      chunkSizeBytes: options.chunkSize || 255 * 1024, // 255KB chunks
      writeConcern: { w: 'majority', j: true },
      readConcern: { level: 'majority' }
    });
    
    this.buckets.set('files', this.defaultBucket);
    
    // Specialized buckets for different content types
    this.setupSpecializedBuckets(options);
    
    // Configuration
    this.config = {
      maxFileSize: options.maxFileSize || 5 * 1024 * 1024 * 1024, // 5GB
      enableCompression: options.enableCompression !== false,
      enableDeduplication: options.enableDeduplication !== false,
      enableThumbnails: options.enableThumbnails !== false,
      enableMetadataExtraction: options.enableMetadataExtraction !== false,
      supportedMimeTypes: options.supportedMimeTypes || [
        'image/*', 'video/*', 'audio/*', 'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.*',
        'text/*', 'application/json', 'application/zip'
      ],
      
      // Advanced features
      enableVersioning: options.enableVersioning || false,
      enableEncryption: options.enableEncryption || false,
      enableAuditLogging: options.enableAuditLogging !== false
    };
    
    this.setupIndexes();
    this.initializeFileProcessing();
  }

  setupSpecializedBuckets(options) {
    // Images bucket with smaller chunks for better streaming
    const imagesBucket = new GridFSBucket(this.db, {
      bucketName: 'images',
      chunkSizeBytes: 64 * 1024 // 64KB for images
    });
    this.buckets.set('images', imagesBucket);
    
    // Videos bucket with larger chunks for efficiency
    const videosBucket = new GridFSBucket(this.db, {
      bucketName: 'videos', 
      chunkSizeBytes: 1024 * 1024 // 1MB for videos
    });
    this.buckets.set('videos', videosBucket);
    
    // Documents bucket for office files and PDFs
    const documentsBucket = new GridFSBucket(this.db, {
      bucketName: 'documents',
      chunkSizeBytes: 256 * 1024 // 256KB for documents
    });
    this.buckets.set('documents', documentsBucket);
    
    // Archives bucket for compressed files
    const archivesBucket = new GridFSBucket(this.db, {
      bucketName: 'archives',
      chunkSizeBytes: 512 * 1024 // 512KB for archives
    });
    this.buckets.set('archives', archivesBucket);
  }

  async setupIndexes() {
    console.log('Setting up GridFS indexes...');
    
    try {
      // Create indexes for each bucket
      for (const [bucketName, bucket] of this.buckets) {
        const filesCollection = this.db.collection(`${bucketName}.files`);
        const chunksCollection = this.db.collection(`${bucketName}.chunks`);
        
        // Files collection indexes
        await filesCollection.createIndexes([
          { key: { filename: 1, uploadDate: -1 } },
          { key: { 'metadata.contentType': 1, uploadDate: -1 } },
          { key: { 'metadata.tags': 1 } },
          { key: { 'metadata.category': 1, uploadDate: -1 } },
          { key: { 'metadata.uploadedBy': 1, uploadDate: -1 } },
          { key: { 'metadata.fileHash': 1 }, unique: true, sparse: true },
          { key: { 'metadata.isPublic': 1, uploadDate: -1 } },
          
          // Text search index for filename and metadata
          { key: { 
            filename: 'text', 
            'metadata.description': 'text',
            'metadata.tags': 'text'
          } },
          
          // Compound indexes for common queries
          { key: { 
            'metadata.contentType': 1, 
            'metadata.isPublic': 1, 
            uploadDate: -1 
          } }
        ]);
        
        // Chunks collection index (usually created automatically)
        await chunksCollection.createIndex({ files_id: 1, n: 1 }, { unique: true });
      }
      
      console.log('GridFS indexes created successfully');
    } catch (error) {
      console.error('Error setting up GridFS indexes:', error);
      throw error;
    }
  }

  async uploadFile(fileBuffer, filename, options = {}) {
    console.log(`Uploading file: ${filename} (${fileBuffer.length} bytes)`);
    
    try {
      // Validate file
      await this.validateFile(fileBuffer, filename, options);
      
      // Determine bucket based on content type
      const contentType = options.contentType || this.detectContentType(filename);
      const bucket = this.selectBucket(contentType);
      
      // Check for duplicates if enabled
      let existingFile = null;
      if (this.config.enableDeduplication) {
        existingFile = await this.checkForDuplicate(fileBuffer, options);
        if (existingFile) {
          console.log(`Duplicate file found: ${existingFile._id}`);
          return await this.handleDuplicate(existingFile, filename, options);
        }
      }
      
      // Prepare metadata
      const metadata = await this.prepareFileMetadata(fileBuffer, filename, contentType, options);
      
      // Create upload stream
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: metadata,
        chunkSizeBytes: this.getOptimalChunkSize(fileBuffer.length, contentType)
      });
      
      return new Promise((resolve, reject) => {
        uploadStream.on('error', reject);
        uploadStream.on('finish', async () => {
          console.log(`File uploaded successfully: ${uploadStream.id}`);
          
          try {
            // Post-upload processing
            const processingResult = await this.postUploadProcessing(
              uploadStream.id, 
              fileBuffer, 
              filename, 
              contentType, 
              metadata
            );
            
            // Return comprehensive file information
            resolve({
              fileId: uploadStream.id,
              filename: filename,
              contentType: contentType,
              size: fileBuffer.length,
              metadata: metadata,
              bucket: bucket.bucketName,
              uploadDate: new Date(),
              processingResult: processingResult,
              downloadUrl: `/api/files/${uploadStream.id}`,
              thumbnailUrl: processingResult.thumbnail ? 
                `/api/files/${uploadStream.id}/thumbnail` : null
            });
            
          } catch (processingError) {
            console.error('Post-upload processing failed:', processingError);
            // Still resolve with basic file info even if processing fails
            resolve({
              fileId: uploadStream.id,
              filename: filename,
              contentType: contentType,
              size: fileBuffer.length,
              metadata: metadata,
              bucket: bucket.bucketName,
              uploadDate: new Date(),
              warning: 'Post-upload processing failed'
            });
          }
        });
        
        // Write file buffer to stream
        uploadStream.end(fileBuffer);
      });
      
    } catch (error) {
      console.error(`Error uploading file ${filename}:`, error);
      throw error;
    }
  }

  async validateFile(fileBuffer, filename, options) {
    // File size validation
    if (fileBuffer.length > this.config.maxFileSize) {
      throw new Error(
        `File too large: ${fileBuffer.length} bytes (max: ${this.config.maxFileSize})`
      );
    }
    
    if (fileBuffer.length === 0) {
      throw new Error('Cannot upload empty file');
    }
    
    // Content type validation
    const contentType = options.contentType || this.detectContentType(filename);
    if (!this.isContentTypeSupported(contentType)) {
      throw new Error(`Unsupported file type: ${contentType}`);
    }
    
    // Filename validation
    if (!filename || filename.trim().length === 0) {
      throw new Error('Filename is required');
    }
    
    // Check for malicious content (basic checks)
    await this.scanForMaliciousContent(fileBuffer, filename, contentType);
  }

  async prepareFileMetadata(fileBuffer, filename, contentType, options) {
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    const metadata = {
      originalFilename: filename,
      contentType: contentType,
      fileSize: fileBuffer.length,
      fileHash: fileHash,
      uploadedBy: options.uploadedBy || null,
      uploadedAt: new Date(),
      
      // File characteristics
      mimeType: contentType,
      fileExtension: path.extname(filename).toLowerCase(),
      
      // User-provided metadata
      description: options.description || null,
      tags: options.tags || [],
      category: options.category || this.categorizeByContentType(contentType),
      isPublic: options.isPublic !== false,
      accessLevel: options.accessLevel || 'public',
      
      // System metadata
      version: options.version || 1,
      parentFileId: options.parentFileId || null,
      processingStatus: 'pending',
      
      // Storage information
      compressionType: null,
      encryptionType: options.enableEncryption ? 'AES256' : null,
      
      // Additional metadata
      customFields: options.customFields || {}
    };
    
    // Extract additional metadata based on file type
    if (this.config.enableMetadataExtraction) {
      const extractedMetadata = await this.extractFileMetadata(fileBuffer, contentType);
      metadata.extracted = extractedMetadata;
    }
    
    return metadata;
  }

  async extractFileMetadata(fileBuffer, contentType) {
    const metadata = {};
    
    try {
      if (contentType.startsWith('image/')) {
        // Extract image metadata (simplified - would use actual image processing library)
        metadata.imageInfo = {
          format: contentType.split('/')[1],
          // In production, use libraries like sharp or jimp for actual metadata extraction
          estimated_width: null,
          estimated_height: null,
          color_space: null,
          has_transparency: null
        };
      } else if (contentType.startsWith('video/')) {
        // Extract video metadata
        metadata.videoInfo = {
          format: contentType.split('/')[1],
          estimated_duration: null,
          estimated_bitrate: null,
          estimated_resolution: null
        };
      } else if (contentType === 'application/pdf') {
        // Extract PDF metadata
        metadata.documentInfo = {
          estimated_page_count: null,
          estimated_word_count: null,
          has_text_layer: null,
          has_forms: null
        };
      }
    } catch (extractionError) {
      console.error('Metadata extraction failed:', extractionError);
      metadata.extraction_error = extractionError.message;
    }
    
    return metadata;
  }

  async postUploadProcessing(fileId, fileBuffer, filename, contentType, metadata) {
    console.log(`Starting post-upload processing for file: ${fileId}`);
    
    const processingResult = {
      thumbnail: null,
      textContent: null,
      additionalFormats: [],
      processingErrors: []
    };
    
    try {
      // Generate thumbnail for images and videos
      if (this.config.enableThumbnails) {
        if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
          processingResult.thumbnail = await this.generateThumbnail(
            fileId, 
            fileBuffer, 
            contentType
          );
        }
      }
      
      // Extract text content for searchable documents
      if (this.isTextExtractable(contentType)) {
        processingResult.textContent = await this.extractTextContent(
          fileBuffer, 
          contentType
        );
      }
      
      // Update processing status
      await this.updateFileMetadata(fileId, {
        'metadata.processingStatus': 'completed',
        'metadata.processingResult': processingResult,
        'metadata.processedAt': new Date()
      });
      
    } catch (processingError) {
      console.error('Post-upload processing failed:', processingError);
      processingResult.processingErrors.push(processingError.message);
      
      await this.updateFileMetadata(fileId, {
        'metadata.processingStatus': 'failed',
        'metadata.processingError': processingError.message,
        'metadata.processedAt': new Date()
      });
    }
    
    return processingResult;
  }

  async downloadFile(fileId, options = {}) {
    console.log(`Downloading file: ${fileId}`);
    
    try {
      // Get file metadata first
      const fileInfo = await this.getFileInfo(fileId);
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`);
      }
      
      // Check permissions
      if (!this.hasAccessPermission(fileInfo, options.user)) {
        throw new Error('Access denied');
      }
      
      // Select appropriate bucket
      const bucket = this.selectBucketByFileInfo(fileInfo);
      
      // Create download stream
      const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
      
      // Handle range requests for partial downloads
      if (options.range) {
        return this.handleRangeRequest(downloadStream, fileInfo, options.range);
      }
      
      // Return full file stream
      return {
        stream: downloadStream,
        fileInfo: fileInfo,
        contentType: fileInfo.metadata.contentType,
        filename: fileInfo.filename,
        size: fileInfo.length
      };
      
    } catch (error) {
      console.error(`Error downloading file ${fileId}:`, error);
      throw error;
    }
  }

  async searchFiles(query, options = {}) {
    console.log(`Searching files with query: ${query}`);
    
    try {
      const searchCriteria = this.buildSearchCriteria(query, options);
      const pipeline = this.buildFileSearchPipeline(searchCriteria, options);
      
      // Execute search across all relevant buckets
      const results = [];
      const buckets = options.bucket ? [options.bucket] : Array.from(this.buckets.keys());
      
      for (const bucketName of buckets) {
        const filesCollection = this.db.collection(`${bucketName}.files`);
        const bucketResults = await filesCollection.aggregate(pipeline).toArray();
        
        // Add bucket information to results
        bucketResults.forEach(result => {
          result.bucket = bucketName;
          result.downloadUrl = `/api/files/${result._id}`;
          result.thumbnailUrl = result.metadata.processingResult?.thumbnail ? 
            `/api/files/${result._id}/thumbnail` : null;
        });
        
        results.push(...bucketResults);
      }
      
      // Sort combined results
      const sortedResults = this.sortSearchResults(results, options);
      
      // Apply pagination
      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const paginatedResults = sortedResults.slice(offset, offset + limit);
      
      return {
        files: paginatedResults,
        totalCount: results.length,
        query: query,
        searchOptions: options,
        executionTime: Date.now() - (options.startTime || Date.now())
      };
      
    } catch (error) {
      console.error('Error searching files:', error);
      throw error;
    }
  }

  buildSearchCriteria(query, options) {
    const criteria = { $and: [] };
    
    // Text search
    if (query && query.trim().length > 0) {
      criteria.$and.push({
        $or: [
          { filename: { $regex: query, $options: 'i' } },
          { 'metadata.description': { $regex: query, $options: 'i' } },
          { 'metadata.tags': { $in: [new RegExp(query, 'i')] } },
          { $text: { $search: query } }
        ]
      });
    }
    
    // Content type filter
    if (options.contentType) {
      criteria.$and.push({
        'metadata.contentType': options.contentType
      });
    }
    
    // Category filter
    if (options.category) {
      criteria.$and.push({
        'metadata.category': options.category
      });
    }
    
    // Access level filter
    if (options.accessLevel) {
      criteria.$and.push({
        'metadata.accessLevel': options.accessLevel
      });
    }
    
    // Date range filter
    if (options.dateFrom || options.dateTo) {
      const dateFilter = {};
      if (options.dateFrom) dateFilter.$gte = new Date(options.dateFrom);
      if (options.dateTo) dateFilter.$lte = new Date(options.dateTo);
      criteria.$and.push({ uploadDate: dateFilter });
    }
    
    // Size filter
    if (options.minSize || options.maxSize) {
      const sizeFilter = {};
      if (options.minSize) sizeFilter.$gte = options.minSize;
      if (options.maxSize) sizeFilter.$lte = options.maxSize;
      criteria.$and.push({ length: sizeFilter });
    }
    
    // User filter
    if (options.uploadedBy) {
      criteria.$and.push({
        'metadata.uploadedBy': options.uploadedBy
      });
    }
    
    // Public access filter
    if (options.publicOnly) {
      criteria.$and.push({
        'metadata.isPublic': true
      });
    }
    
    return criteria.$and.length > 0 ? criteria : {};
  }

  buildFileSearchPipeline(criteria, options) {
    const pipeline = [];
    
    // Match stage
    if (Object.keys(criteria).length > 0) {
      pipeline.push({ $match: criteria });
    }
    
    // Add computed fields for relevance scoring
    pipeline.push({
      $addFields: {
        relevanceScore: {
          $add: [
            // Filename match bonus
            {
              $cond: {
                if: { $regexMatch: { input: '$filename', regex: options.query || '', options: 'i' } },
                then: 3,
                else: 0
              }
            },
            // Size factor (prefer reasonable file sizes)
            {
              $cond: {
                if: { $and: [{ $gte: ['$length', 1000] }, { $lte: ['$length', 10000000] }] },
                then: 1,
                else: 0
              }
            },
            // Recency bonus
            {
              $cond: {
                if: { $gte: ['$uploadDate', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                then: 2,
                else: 0
              }
            },
            // Processing status bonus
            {
              $cond: {
                if: { $eq: ['$metadata.processingStatus', 'completed'] },
                then: 1,
                else: 0
              }
            }
          ]
        },
        
        // Formatted file size
        formattedSize: {
          $switch: {
            branches: [
              { case: { $lt: ['$length', 1024] }, then: { $concat: [{ $toString: '$length' }, ' bytes'] } },
              { case: { $lt: ['$length', 1048576] }, then: { $concat: [{ $toString: { $round: [{ $divide: ['$length', 1024] }, 1] } }, ' KB'] } },
              { case: { $lt: ['$length', 1073741824] }, then: { $concat: [{ $toString: { $round: [{ $divide: ['$length', 1048576] }, 1] } }, ' MB'] } }
            ],
            default: { $concat: [{ $toString: { $round: [{ $divide: ['$length', 1073741824] }, 1] } }, ' GB'] }
          }
        }
      }
    });
    
    // Project relevant fields
    pipeline.push({
      $project: {
        _id: 1,
        filename: 1,
        length: 1,
        formattedSize: 1,
        uploadDate: 1,
        relevanceScore: 1,
        'metadata.contentType': 1,
        'metadata.category': 1,
        'metadata.description': 1,
        'metadata.tags': 1,
        'metadata.isPublic': 1,
        'metadata.uploadedBy': 1,
        'metadata.processingStatus': 1,
        'metadata.processingResult': 1,
        'metadata.fileHash': 1
      }
    });
    
    return pipeline;
  }

  // Utility methods
  
  selectBucket(contentType) {
    if (contentType.startsWith('image/')) return this.buckets.get('images');
    if (contentType.startsWith('video/')) return this.buckets.get('videos');
    if (contentType.includes('pdf') || contentType.includes('document')) return this.buckets.get('documents');
    if (contentType.includes('zip') || contentType.includes('archive')) return this.buckets.get('archives');
    return this.defaultBucket;
  }

  detectContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
      '.pdf': 'application/pdf', '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.zip': 'application/zip', '.tar': 'application/x-tar', '.gz': 'application/gzip',
      '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  isContentTypeSupported(contentType) {
    return this.config.supportedMimeTypes.some(pattern => 
      pattern.endsWith('*') ? 
        contentType.startsWith(pattern.slice(0, -1)) : 
        contentType === pattern
    );
  }

  categorizeByContentType(contentType) {
    if (contentType.startsWith('image/')) return 'images';
    if (contentType.startsWith('video/')) return 'videos';  
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.includes('pdf')) return 'documents';
    if (contentType.includes('document') || contentType.includes('text')) return 'documents';
    if (contentType.includes('zip') || contentType.includes('archive')) return 'archives';
    return 'misc';
  }

  getOptimalChunkSize(fileSize, contentType) {
    // Optimize chunk size based on file size and type
    if (contentType.startsWith('image/') && fileSize < 1024 * 1024) return 64 * 1024; // 64KB for small images
    if (contentType.startsWith('video/')) return 1024 * 1024; // 1MB for videos
    if (fileSize > 100 * 1024 * 1024) return 512 * 1024; // 512KB for large files
    return 255 * 1024; // Default 255KB
  }
}

// Benefits of MongoDB GridFS:
// - Automatic file chunking and reassembly
// - Built-in streaming for large files
// - Integrated metadata storage and indexing
// - High-performance binary data operations
// - Automatic replication and sharding support
// - ACID transactions for file operations
// - Advanced query capabilities on file metadata
// - Built-in compression and optimization
// - Seamless integration with MongoDB operations
// - Production-ready scalability and performance

module.exports = { AdvancedGridFSManager };
```

## File Management and Advanced Operations

### Comprehensive File Operations and Metadata Management

Implement sophisticated file management capabilities:

```javascript
// Advanced file management operations with GridFS
class ProductionGridFSOperations extends AdvancedGridFSManager {
  constructor(db, options) {
    super(db, options);
    this.setupAdvancedCapabilities();
  }

  async implementAdvancedFileOperations() {
    console.log('Setting up advanced GridFS operations...');
    
    // File versioning system
    await this.setupFileVersioning();
    
    // Duplicate detection and deduplication
    await this.setupDeduplicationSystem();
    
    // File sharing and collaboration
    await this.setupFileSharingSystem();
    
    // Automated file lifecycle management
    await this.setupLifecycleManagement();
    
    // File analytics and reporting
    await this.setupFileAnalytics();
  }

  async createFileVersion(originalFileId, fileBuffer, versionMetadata = {}) {
    console.log(`Creating new version for file: ${originalFileId}`);
    
    try {
      // Get original file information
      const originalFile = await this.getFileInfo(originalFileId);
      if (!originalFile) {
        throw new Error(`Original file not found: ${originalFileId}`);
      }
      
      // Increment version number
      const newVersion = (originalFile.metadata.version || 1) + 1;
      
      // Upload new version with linked metadata
      const uploadOptions = {
        ...versionMetadata,
        parentFileId: originalFileId,
        version: newVersion,
        originalFilename: originalFile.filename,
        versionType: versionMetadata.versionType || 'update',
        versionComment: versionMetadata.comment || 'Updated version',
        uploadedBy: versionMetadata.uploadedBy,
        contentType: originalFile.metadata.contentType
      };
      
      const newVersionFile = await this.uploadFile(fileBuffer, originalFile.filename, uploadOptions);
      
      // Update version history in original file
      await this.updateFileMetadata(originalFileId, {
        'metadata.hasVersions': true,
        'metadata.latestVersion': newVersion,
        'metadata.latestVersionId': newVersionFile.fileId,
        $push: {
          'metadata.versionHistory': {
            versionId: newVersionFile.fileId,
            version: newVersion,
            createdAt: new Date(),
            createdBy: versionMetadata.uploadedBy,
            comment: versionMetadata.comment || '',
            fileSize: fileBuffer.length
          }
        }
      });
      
      return {
        originalFileId: originalFileId,
        newVersionId: newVersionFile.fileId,
        version: newVersion,
        versionInfo: newVersionFile
      };
      
    } catch (error) {
      console.error('Error creating file version:', error);
      throw error;
    }
  }

  async getFileVersionHistory(fileId) {
    console.log(`Getting version history for file: ${fileId}`);
    
    try {
      const file = await this.getFileInfo(fileId);
      if (!file || !file.metadata.hasVersions) {
        return { fileId: fileId, versions: [] };
      }
      
      // Get all versions
      const pipeline = [
        {
          $match: {
            $or: [
              { _id: new ObjectId(fileId) },
              { 'metadata.parentFileId': fileId }
            ]
          }
        },
        {
          $sort: { 'metadata.version': 1 }
        },
        {
          $project: {
            _id: 1,
            filename: 1,
            length: 1,
            uploadDate: 1,
            'metadata.version': 1,
            'metadata.versionType': 1,
            'metadata.versionComment': 1,
            'metadata.uploadedBy': 1,
            'metadata.contentType': 1
          }
        }
      ];
      
      const filesCollection = this.db.collection('files.files');
      const versions = await filesCollection.aggregate(pipeline).toArray();
      
      return {
        fileId: fileId,
        originalFile: file,
        versions: versions,
        totalVersions: versions.length
      };
      
    } catch (error) {
      console.error('Error getting version history:', error);
      throw error;
    }
  }

  async shareFile(fileId, shareOptions = {}) {
    console.log(`Creating file share for: ${fileId}`);
    
    try {
      const file = await this.getFileInfo(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }
      
      // Generate share token
      const shareToken = crypto.randomBytes(32).toString('hex');
      
      const shareRecord = {
        _id: new ObjectId(),
        fileId: fileId,
        shareToken: shareToken,
        sharedBy: shareOptions.sharedBy,
        createdAt: new Date(),
        expiresAt: shareOptions.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        
        // Share settings
        allowDownload: shareOptions.allowDownload !== false,
        allowView: shareOptions.allowView !== false,
        allowComment: shareOptions.allowComment || false,
        requireAuth: shareOptions.requireAuth || false,
        
        // Access tracking
        accessCount: 0,
        lastAccessedAt: null,
        accessLog: [],
        
        // Share metadata
        shareNote: shareOptions.note || '',
        shareName: shareOptions.name || `Share of ${file.filename}`,
        shareType: shareOptions.shareType || 'public_link',
        
        // Restrictions
        maxDownloads: shareOptions.maxDownloads || null,
        allowedDomains: shareOptions.allowedDomains || [],
        allowedUsers: shareOptions.allowedUsers || []
      };
      
      // Store share record
      const sharesCollection = this.db.collection('file_shares');
      await sharesCollection.insertOne(shareRecord);
      
      // Update file metadata
      await this.updateFileMetadata(fileId, {
        'metadata.isShared': true,
        'metadata.shareCount': { $inc: 1 },
        $push: {
          'metadata.shareHistory': {
            shareId: shareRecord._id,
            shareToken: shareToken,
            createdAt: new Date(),
            sharedBy: shareOptions.sharedBy
          }
        }
      });
      
      return {
        shareId: shareRecord._id,
        shareToken: shareToken,
        shareUrl: `/api/shared/${shareToken}`,
        expiresAt: shareRecord.expiresAt,
        shareSettings: {
          allowDownload: shareRecord.allowDownload,
          allowView: shareRecord.allowView,
          allowComment: shareRecord.allowComment
        }
      };
      
    } catch (error) {
      console.error('Error creating file share:', error);
      throw error;
    }
  }

  async analyzeStorageUsage(options = {}) {
    console.log('Analyzing GridFS storage usage...');
    
    try {
      const analysisResults = {};
      
      // Analyze each bucket
      for (const [bucketName, bucket] of this.buckets) {
        const filesCollection = this.db.collection(`${bucketName}.files`);
        
        const bucketAnalysis = await filesCollection.aggregate([
          {
            $group: {
              _id: null,
              totalFiles: { $sum: 1 },
              totalSize: { $sum: '$length' },
              avgFileSize: { $avg: '$length' },
              maxFileSize: { $max: '$length' },
              minFileSize: { $min: '$length' },
              
              // Content type distribution
              contentTypes: {
                $push: '$metadata.contentType'
              },
              
              // Upload date analysis
              oldestFile: { $min: '$uploadDate' },
              newestFile: { $max: '$uploadDate' },
              
              // User analysis
              uploaders: {
                $addToSet: '$metadata.uploadedBy'
              }
            }
          },
          {
            $addFields: {
              // Content type statistics
              contentTypeStats: {
                $reduce: {
                  input: '$contentTypes',
                  initialValue: {},
                  in: {
                    $mergeObjects: [
                      '$$value',
                      {
                        $arrayToObject: [
                          [{ k: '$$this', v: { $add: [{ $ifNull: [{ $getField: { field: '$$this', input: '$$value' } }, 0] }, 1] } }]
                        ]
                      }
                    ]
                  }
                }
              },
              
              // Storage efficiency metrics
              avgChunkCount: {
                $divide: ['$totalSize', 255 * 1024] // Assuming 255KB chunks
              },
              
              storageEfficiency: {
                $multiply: [
                  { $divide: ['$totalSize', { $add: ['$totalSize', { $multiply: ['$totalFiles', 1024] }] }] }, // Account for metadata overhead
                  100
                ]
              }
            }
          }
        ]).toArray();
        
        // Additional bucket-specific analysis
        const categoryAnalysis = await filesCollection.aggregate([
          {
            $group: {
              _id: '$metadata.category',
              fileCount: { $sum: 1 },
              totalSize: { $sum: '$length' },
              avgSize: { $avg: '$length' }
            }
          },
          { $sort: { fileCount: -1 } }
        ]).toArray();
        
        const recentActivity = await filesCollection.aggregate([
          {
            $match: {
              uploadDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: { 
                $dateToString: { format: '%Y-%m-%d', date: '$uploadDate' }
              },
              filesUploaded: { $sum: 1 },
              sizeUploaded: { $sum: '$length' }
            }
          },
          { $sort: { _id: 1 } }
        ]).toArray();
        
        analysisResults[bucketName] = {
          overview: bucketAnalysis[0] || {},
          categoryBreakdown: categoryAnalysis,
          recentActivity: recentActivity,
          recommendations: this.generateStorageRecommendations(bucketAnalysis[0], categoryAnalysis)
        };
      }
      
      // Overall system analysis
      const systemStats = {
        totalBuckets: this.buckets.size,
        analysisDate: new Date(),
        recommendations: this.generateSystemRecommendations(analysisResults)
      };
      
      return {
        systemStats: systemStats,
        bucketAnalysis: analysisResults,
        summary: this.generateStorageSummary(analysisResults)
      };
      
    } catch (error) {
      console.error('Error analyzing storage usage:', error);
      throw error;
    }
  }

  generateStorageRecommendations(bucketStats, categoryStats) {
    const recommendations = [];
    
    if (bucketStats) {
      // Size-based recommendations
      if (bucketStats.avgFileSize > 50 * 1024 * 1024) { // 50MB
        recommendations.push({
          type: 'optimization',
          priority: 'medium',
          message: 'Large average file size detected. Consider implementing file compression.',
          action: 'Enable compression for new uploads'
        });
      }
      
      if (bucketStats.totalFiles > 10000) {
        recommendations.push({
          type: 'performance',
          priority: 'high', 
          message: 'High file count may impact query performance.',
          action: 'Consider implementing file archiving or additional indexing'
        });
      }
      
      if (bucketStats.storageEfficiency < 85) {
        recommendations.push({
          type: 'efficiency',
          priority: 'low',
          message: 'Storage efficiency could be improved.',
          action: 'Review chunk size settings and consider deduplication'
        });
      }
    }
    
    // Category-based recommendations
    if (categoryStats) {
      const topCategory = categoryStats[0];
      if (topCategory && topCategory.avgSize > 100 * 1024 * 1024) { // 100MB
        recommendations.push({
          type: 'category_optimization',
          priority: 'medium',
          message: `Category "${topCategory._id}" has large average file sizes.`,
          action: 'Consider specialized handling for this content type'
        });
      }
    }
    
    return recommendations;
  }

  async cleanupExpiredShares() {
    console.log('Cleaning up expired file shares...');
    
    try {
      const sharesCollection = this.db.collection('file_shares');
      
      // Find expired shares
      const expiredShares = await sharesCollection.find({
        expiresAt: { $lt: new Date() }
      }).toArray();
      
      if (expiredShares.length === 0) {
        console.log('No expired shares found');
        return { deletedCount: 0, updatedFiles: 0 };
      }
      
      // Remove expired shares
      const deleteResult = await sharesCollection.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      // Update affected files
      const fileIds = expiredShares.map(share => share.fileId);
      const updateResult = await this.db.collection('files.files').updateMany(
        { _id: { $in: fileIds } },
        {
          $set: { 'metadata.isShared': false },
          $unset: { 'metadata.activeShares': '' }
        }
      );
      
      console.log(`Cleaned up ${deleteResult.deletedCount} expired shares`);
      
      return {
        deletedCount: deleteResult.deletedCount,
        updatedFiles: updateResult.modifiedCount,
        expiredShareIds: expiredShares.map(s => s._id)
      };
      
    } catch (error) {
      console.error('Error cleaning up expired shares:', error);
      throw error;
    }
  }
}
```

## QueryLeaf GridFS Integration

QueryLeaf provides familiar SQL syntax for GridFS file operations and management:

```sql
-- QueryLeaf GridFS operations with SQL-familiar syntax

-- File upload and metadata management using SQL-style syntax
INSERT INTO gridfs_files (
  filename, 
  content, 
  content_type, 
  metadata
) VALUES (
  'product_manual.pdf',
  FILE_CONTENT('/path/to/local/file.pdf'),
  'application/pdf',
  JSON_OBJECT(
    'category', 'documentation',
    'tags', ARRAY['manual', 'product', 'guide'],
    'description', 'Product user manual version 2.1',
    'uploadedBy', CURRENT_USER_ID(),
    'accessLevel', 'public',
    'department', 'customer_support'
  )
);

-- Advanced file search with metadata filtering and full-text search
SELECT 
  f.file_id,
  f.filename,
  f.content_type,
  f.file_size,
  FORMAT_BYTES(f.file_size) as formatted_size,
  f.upload_date,
  f.metadata->>'category' as category,
  f.metadata->>'description' as description,
  JSON_EXTRACT(f.metadata, '$.tags') as tags,
  f.metadata->>'uploadedBy' as uploaded_by,
  
  -- File characteristics and analysis
  CASE f.content_type
    WHEN 'image/jpeg' THEN 'Image'
    WHEN 'image/png' THEN 'Image'
    WHEN 'application/pdf' THEN 'Document'
    WHEN 'video/mp4' THEN 'Video'
    WHEN 'audio/mpeg' THEN 'Audio'
    ELSE 'Other'
  END as file_type,
  
  -- File age and recency
  EXTRACT(DAYS FROM CURRENT_DATE - f.upload_date) as days_old,
  CASE 
    WHEN f.upload_date > CURRENT_DATE - INTERVAL '7 days' THEN 'Recent'
    WHEN f.upload_date > CURRENT_DATE - INTERVAL '30 days' THEN 'Current'
    WHEN f.upload_date > CURRENT_DATE - INTERVAL '90 days' THEN 'Older'
    ELSE 'Archive'
  END as age_category,
  
  -- Access and sharing information
  f.metadata->>'isPublic' as is_public,
  f.metadata->>'accessLevel' as access_level,
  COALESCE(f.metadata->>'shareCount', '0')::INTEGER as share_count,
  
  -- Processing status
  f.metadata->>'processingStatus' as processing_status,
  CASE f.metadata->>'processingStatus'
    WHEN 'completed' THEN '✓ Processed'
    WHEN 'pending' THEN '⏳ Processing'
    WHEN 'failed' THEN '❌ Failed'
    ELSE '❓ Unknown'
  END as processing_display,
  
  -- File URLs and access
  CONCAT('/api/files/', f.file_id, '/download') as download_url,
  CONCAT('/api/files/', f.file_id, '/view') as view_url,
  CASE 
    WHEN f.metadata->'processingResult'->>'thumbnail' IS NOT NULL 
    THEN CONCAT('/api/files/', f.file_id, '/thumbnail')
    ELSE NULL
  END as thumbnail_url,
  
  -- Relevance scoring for search
  (
    CASE 
      WHEN f.filename ILIKE '%search_term%' THEN 5
      WHEN f.metadata->>'description' ILIKE '%search_term%' THEN 3
      WHEN JSON_EXTRACT(f.metadata, '$.tags') @> '["search_term"]' THEN 4
      ELSE 1
    END +
    CASE f.metadata->>'processingStatus'
      WHEN 'completed' THEN 2
      ELSE 0
    END +
    CASE 
      WHEN f.upload_date > CURRENT_DATE - INTERVAL '30 days' THEN 1
      ELSE 0
    END
  ) as relevance_score

FROM gridfs_files f
WHERE 
  -- Text search across filename, description, and tags
  (
    f.filename ILIKE '%document%' OR
    f.metadata->>'description' ILIKE '%document%' OR
    JSON_EXTRACT(f.metadata, '$.tags') @> '["document"]'
  )
  
  -- Content type filtering
  AND f.content_type IN ('application/pdf', 'application/msword', 'text/plain')
  
  -- Access level filtering
  AND f.metadata->>'accessLevel' IN ('public', 'internal')
  
  -- Size filtering (documents between 1KB and 50MB)
  AND f.file_size BETWEEN 1024 AND 52428800
  
  -- Date range filtering (last 6 months)
  AND f.upload_date >= CURRENT_DATE - INTERVAL '6 months'
  
ORDER BY relevance_score DESC, f.upload_date DESC
LIMIT 25;

-- File analytics and storage insights
WITH file_statistics AS (
  SELECT 
    COUNT(*) as total_files,
    SUM(f.file_size) as total_storage_bytes,
    AVG(f.file_size) as avg_file_size,
    MIN(f.file_size) as smallest_file,
    MAX(f.file_size) as largest_file,
    COUNT(*) FILTER (WHERE f.upload_date > CURRENT_DATE - INTERVAL '30 days') as recent_uploads,
    COUNT(*) FILTER (WHERE f.metadata->>'processingStatus' = 'completed') as processed_files,
    COUNT(DISTINCT f.metadata->>'uploadedBy') as unique_uploaders,
    
    -- Content type distribution
    JSON_OBJECT_AGG(
      CASE f.content_type
        WHEN 'image/jpeg' THEN 'JPEG Images'
        WHEN 'image/png' THEN 'PNG Images'
        WHEN 'application/pdf' THEN 'PDF Documents'
        WHEN 'video/mp4' THEN 'MP4 Videos'
        WHEN 'audio/mpeg' THEN 'MP3 Audio'
        ELSE 'Other Files'
      END,
      COUNT(*)
    ) as content_type_distribution,
    
    -- Category breakdown
    JSON_OBJECT_AGG(
      COALESCE(f.metadata->>'category', 'Uncategorized'),
      COUNT(*)
    ) as category_distribution,
    
    -- Size category analysis
    JSON_OBJECT(
      'Small (<1MB)', COUNT(*) FILTER (WHERE f.file_size < 1048576),
      'Medium (1-10MB)', COUNT(*) FILTER (WHERE f.file_size BETWEEN 1048576 AND 10485760),
      'Large (10-100MB)', COUNT(*) FILTER (WHERE f.file_size BETWEEN 10485760 AND 104857600),
      'Very Large (>100MB)', COUNT(*) FILTER (WHERE f.file_size > 104857600)
    ) as size_distribution
    
  FROM gridfs_files f
),
storage_efficiency AS (
  SELECT 
    -- Storage efficiency metrics
    ROUND((fs.total_storage_bytes / (1024.0 * 1024 * 1024))::numeric, 2) as storage_gb,
    ROUND((fs.avg_file_size / 1048576.0)::numeric, 2) as avg_size_mb,
    
    -- Upload trends
    ROUND((fs.recent_uploads::numeric / fs.total_files * 100)::numeric, 1) as recent_upload_percentage,
    
    -- Processing efficiency
    ROUND((fs.processed_files::numeric / fs.total_files * 100)::numeric, 1) as processing_success_rate,
    
    -- Storage growth estimation
    CASE 
      WHEN fs.recent_uploads > 0 THEN
        ROUND((fs.recent_uploads * 12.0 / fs.total_files * fs.total_storage_bytes / (1024.0 * 1024 * 1024))::numeric, 2)
      ELSE 0
    END as estimated_yearly_growth_gb
    
  FROM file_statistics fs
),
top_uploaders AS (
  SELECT 
    f.metadata->>'uploadedBy' as user_id,
    u.name as user_name,
    COUNT(*) as files_uploaded,
    SUM(f.file_size) as total_bytes_uploaded,
    FORMAT_BYTES(SUM(f.file_size)) as formatted_total_size,
    AVG(f.file_size) as avg_file_size,
    MIN(f.upload_date) as first_upload,
    MAX(f.upload_date) as last_upload,
    
    -- User activity patterns
    COUNT(*) FILTER (WHERE f.upload_date > CURRENT_DATE - INTERVAL '7 days') as uploads_last_week,
    COUNT(*) FILTER (WHERE f.upload_date > CURRENT_DATE - INTERVAL '30 days') as uploads_last_month,
    
    -- Content preferences
    MODE() WITHIN GROUP (ORDER BY f.content_type) as most_common_content_type,
    COUNT(DISTINCT f.content_type) as content_type_diversity
    
  FROM gridfs_files f
  LEFT JOIN users u ON f.metadata->>'uploadedBy' = u.user_id
  GROUP BY f.metadata->>'uploadedBy', u.name
  HAVING COUNT(*) >= 5  -- Only users with at least 5 uploads
  ORDER BY files_uploaded DESC
  LIMIT 10
)

-- Final comprehensive analytics report
SELECT 
  -- Overall statistics
  fs.total_files,
  se.storage_gb as total_storage_gb,
  se.avg_size_mb as average_file_size_mb,
  fs.unique_uploaders,
  se.recent_upload_percentage as recent_activity_percentage,
  se.processing_success_rate as processing_success_percentage,
  se.estimated_yearly_growth_gb,
  
  -- Distribution insights
  fs.content_type_distribution,
  fs.category_distribution, 
  fs.size_distribution,
  
  -- Top users summary (as JSON array)
  (
    SELECT JSON_AGG(
      JSON_OBJECT(
        'user_name', tu.user_name,
        'files_uploaded', tu.files_uploaded,
        'total_size', tu.formatted_total_size,
        'uploads_last_month', tu.uploads_last_month
      )
      ORDER BY tu.files_uploaded DESC
    )
    FROM top_uploaders tu
  ) as top_uploaders_summary,
  
  -- Storage optimization recommendations
  CASE 
    WHEN se.storage_gb > 100 THEN 'Consider implementing file archiving and compression policies'
    WHEN se.recent_upload_percentage > 25 THEN 'High upload activity - monitor storage growth'
    WHEN se.processing_success_rate < 90 THEN 'Review file processing pipeline for efficiency'
    ELSE 'Storage usage is within normal parameters'
  END as optimization_recommendation,
  
  -- Health indicators
  JSON_OBJECT(
    'storage_health', CASE 
      WHEN se.storage_gb > 500 THEN 'High Usage'
      WHEN se.storage_gb > 100 THEN 'Moderate Usage'
      ELSE 'Low Usage'
    END,
    'activity_level', CASE 
      WHEN se.recent_upload_percentage > 20 THEN 'High Activity'
      WHEN se.recent_upload_percentage > 5 THEN 'Normal Activity'
      ELSE 'Low Activity'
    END,
    'processing_health', CASE 
      WHEN se.processing_success_rate > 95 THEN 'Excellent'
      WHEN se.processing_success_rate > 80 THEN 'Good'
      ELSE 'Needs Attention'
    END
  ) as system_health

FROM file_statistics fs
CROSS JOIN storage_efficiency se;

-- File version management and history tracking
WITH version_analysis AS (
  SELECT 
    f.file_id,
    f.filename,
    f.metadata->>'parentFileId' as parent_file_id,
    (f.metadata->>'version')::INTEGER as version_number,
    f.metadata->>'versionType' as version_type,
    f.metadata->>'versionComment' as version_comment,
    f.file_size,
    f.upload_date as version_date,
    f.metadata->>'uploadedBy' as version_author,
    
    -- Version relationships
    LAG(f.file_size) OVER (PARTITION BY COALESCE(f.metadata->>'parentFileId', f.file_id) ORDER BY (f.metadata->>'version')::INTEGER) as previous_version_size,
    LAG(f.upload_date) OVER (PARTITION BY COALESCE(f.metadata->>'parentFileId', f.file_id) ORDER BY (f.metadata->>'version')::INTEGER) as previous_version_date,
    
    -- Version statistics
    COUNT(*) OVER (PARTITION BY COALESCE(f.metadata->>'parentFileId', f.file_id)) as total_versions,
    ROW_NUMBER() OVER (PARTITION BY COALESCE(f.metadata->>'parentFileId', f.file_id) ORDER BY (f.metadata->>'version')::INTEGER DESC) as version_rank
    
  FROM gridfs_files f
  WHERE f.metadata->>'version' IS NOT NULL
),
version_insights AS (
  SELECT 
    va.*,
    
    -- Size change analysis
    CASE 
      WHEN va.previous_version_size IS NOT NULL THEN
        va.file_size - va.previous_version_size
      ELSE 0
    END as size_change_bytes,
    
    CASE 
      WHEN va.previous_version_size IS NOT NULL AND va.previous_version_size > 0 THEN
        ROUND(((va.file_size - va.previous_version_size)::numeric / va.previous_version_size * 100)::numeric, 1)
      ELSE 0
    END as size_change_percentage,
    
    -- Time between versions
    CASE 
      WHEN va.previous_version_date IS NOT NULL THEN
        EXTRACT(DAYS FROM va.version_date - va.previous_version_date)
      ELSE 0
    END as days_since_previous_version,
    
    -- Version classification
    CASE va.version_type
      WHEN 'major' THEN '🔴 Major Update'
      WHEN 'minor' THEN '🟡 Minor Update'  
      WHEN 'patch' THEN '🟢 Patch/Fix'
      WHEN 'update' THEN '🔵 Content Update'
      ELSE '⚪ Standard Update'
    END as version_type_display
    
  FROM version_analysis va
)

SELECT 
  vi.file_id,
  vi.filename,
  vi.version_number,
  vi.version_type_display,
  vi.version_comment,
  FORMAT_BYTES(vi.file_size) as current_size,
  vi.version_date,
  vi.version_author,
  vi.total_versions,
  
  -- Change analysis
  CASE 
    WHEN vi.size_change_bytes > 0 THEN 
      CONCAT('+', FORMAT_BYTES(vi.size_change_bytes))
    WHEN vi.size_change_bytes < 0 THEN 
      CONCAT('-', FORMAT_BYTES(ABS(vi.size_change_bytes)))
    ELSE 'No change'
  END as size_change_display,
  
  CONCAT(
    CASE 
      WHEN vi.size_change_percentage > 0 THEN '+'
      ELSE ''
    END,
    vi.size_change_percentage::text, '%'
  ) as size_change_percentage_display,
  
  -- Version timing
  CASE 
    WHEN vi.days_since_previous_version = 0 THEN 'Same day'
    WHEN vi.days_since_previous_version = 1 THEN '1 day'
    WHEN vi.days_since_previous_version < 7 THEN CONCAT(vi.days_since_previous_version, ' days')
    WHEN vi.days_since_previous_version < 30 THEN CONCAT(ROUND(vi.days_since_previous_version / 7.0, 1), ' weeks')
    ELSE CONCAT(ROUND(vi.days_since_previous_version / 30.0, 1), ' months')
  END as time_since_previous,
  
  -- Version context
  CASE vi.version_rank
    WHEN 1 THEN 'Latest Version'
    WHEN 2 THEN 'Previous Version'
    ELSE CONCAT('Version -', vi.version_rank - 1)
  END as version_status,
  
  -- Access URLs
  CONCAT('/api/files/', vi.file_id, '/download') as download_url,
  CONCAT('/api/files/', vi.file_id, '/version-info') as version_info_url,
  CASE 
    WHEN vi.parent_file_id IS NOT NULL THEN 
      CONCAT('/api/files/', vi.parent_file_id, '/versions')
    ELSE 
      CONCAT('/api/files/', vi.file_id, '/versions')
  END as version_history_url

FROM version_insights vi
WHERE vi.total_versions > 1  -- Only show files with multiple versions
ORDER BY vi.filename, vi.version_number DESC;

-- QueryLeaf provides comprehensive GridFS capabilities:
-- 1. Native file upload and download operations with SQL syntax
-- 2. Advanced metadata management and search capabilities
-- 3. Automatic chunking and streaming for large files
-- 4. Built-in file versioning and history tracking
-- 5. Comprehensive file analytics and storage insights
-- 6. Integrated permission and sharing management
-- 7. Automatic file processing and thumbnail generation
-- 8. SQL-familiar syntax for complex file operations
-- 9. Production-ready scalability with MongoDB's GridFS
-- 10. Seamless integration with application data models
```

## Best Practices for GridFS Implementation

### Design Guidelines for Production File Storage

Essential practices for MongoDB GridFS deployments:

1. **Content Type Organization**: Use specialized buckets for different content types to optimize performance
2. **Metadata Design**: Structure metadata for efficient querying and filtering operations  
3. **Chunk Size Optimization**: Configure appropriate chunk sizes based on file types and access patterns
4. **Index Strategy**: Create comprehensive indexes on metadata fields for fast file discovery
5. **Version Management**: Implement systematic file versioning for collaborative environments
6. **Access Control**: Design permission systems integrated with application security models

### Performance and Scalability Optimization

Optimize GridFS for large-scale file storage requirements:

1. **Storage Efficiency**: Implement deduplication and compression strategies
2. **Query Optimization**: Design metadata structures for efficient search operations
3. **Streaming Operations**: Use GridFS streaming for large file uploads and downloads
4. **Caching Strategy**: Implement intelligent caching for frequently accessed files
5. **Monitoring**: Track storage usage, access patterns, and performance metrics
6. **Cleanup Automation**: Automate expired file deletion and storage optimization

## Conclusion

MongoDB GridFS provides comprehensive large file storage capabilities that seamlessly integrate with database operations while delivering high performance, automatic chunking, and sophisticated metadata management. Unlike traditional file storage approaches, GridFS maintains ACID properties, supports complex queries, and scales horizontally with your application.

Key GridFS benefits include:

- **Seamless Integration**: Native MongoDB integration with consistent APIs and operations
- **Automatic Management**: Built-in chunking, streaming, and integrity checking without manual implementation  
- **Scalable Architecture**: Horizontal scaling with MongoDB's sharding and replication capabilities
- **Rich Metadata**: Sophisticated metadata storage and indexing for complex file management scenarios
- **Performance Optimization**: Optimized chunk sizes and streaming operations for various content types
- **Production Ready**: Enterprise-grade reliability with comprehensive monitoring and analytics

Whether you're building content management systems, media libraries, document repositories, or data archival platforms, MongoDB GridFS with QueryLeaf's familiar SQL interface provides the foundation for scalable file storage solutions.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB GridFS operations through SQL-familiar syntax, handling file uploads, metadata management, and complex file queries seamlessly. Advanced file operations, version management, and storage analytics are accessible through standard SQL constructs, making sophisticated file storage capabilities available to SQL-oriented development teams.

The combination of MongoDB GridFS capabilities with SQL-style file operations makes it an ideal platform for applications requiring both advanced file management and familiar database interaction patterns, ensuring your file storage solutions remain both powerful and maintainable as they scale and evolve.