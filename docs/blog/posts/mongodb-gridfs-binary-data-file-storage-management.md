---
title: "MongoDB GridFS and Binary Data Management: Advanced File Storage Patterns for Scalable Document-Based Applications"
description: "Master MongoDB GridFS for large file storage, binary data management, and document-based file systems. Learn advanced GridFS patterns, metadata management, and file operations with SQL-familiar syntax for scalable file storage solutions."
date: 2025-10-05
tags: [mongodb, gridfs, file-storage, binary-data, document-storage, sql, scalability]
---

# MongoDB GridFS and Binary Data Management: Advanced File Storage Patterns for Scalable Document-Based Applications

Modern applications increasingly require sophisticated file storage capabilities that can handle diverse binary data types, massive file sizes, and complex metadata requirements while providing seamless integration with application data models. Traditional file storage approaches often create architectural complexity, separate storage silos, and synchronization challenges that become problematic as applications scale and evolve.

MongoDB GridFS provides a comprehensive solution for storing and managing large files within MongoDB itself, enabling seamless integration between file storage and document data while supporting advanced features like streaming, chunking, versioning, and metadata management. Unlike external file storage systems that require complex coordination mechanisms, GridFS offers native MongoDB integration with automatic sharding, replication, and backup capabilities that ensure file storage scales with application requirements.

## The Traditional File Storage Challenge

Conventional file storage approaches often struggle with scalability, consistency, and integration complexity:

```sql
-- Traditional PostgreSQL file storage with external file system coordination challenges

-- File metadata table with limited integration capabilities  
CREATE TABLE file_metadata (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  content_type VARCHAR(100),
  upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by UUID REFERENCES users(user_id),
  file_hash VARCHAR(64),
  
  -- Basic metadata fields
  storage_location VARCHAR(50) DEFAULT 'local',
  is_public BOOLEAN DEFAULT FALSE,
  access_level VARCHAR(20) DEFAULT 'private',
  
  -- Versioning attempt (complex to manage)
  version_number INTEGER DEFAULT 1,
  parent_file_id UUID REFERENCES file_metadata(file_id),
  
  -- Status tracking
  processing_status VARCHAR(20) DEFAULT 'uploaded',
  last_accessed TIMESTAMP
);

-- Separate table for file associations (loose coupling problems)
CREATE TABLE document_files (
  document_id UUID NOT NULL,
  file_id UUID NOT NULL,
  relationship_type VARCHAR(50) NOT NULL, -- attachment, image, document, etc.
  display_order INTEGER,
  is_primary BOOLEAN DEFAULT FALSE,
  added_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, file_id)
);

-- Complex query requiring multiple joins and external file system coordination
SELECT 
  d.document_id,
  d.title,
  d.content,
  d.created_at,
  
  -- File information requires complex aggregation
  json_agg(
    json_build_object(
      'file_id', fm.file_id,
      'filename', fm.filename,
      'original_filename', fm.original_filename,
      'file_size', fm.file_size,
      'content_type', fm.content_type,
      'file_path', fm.file_path, -- External file system path
      'relationship_type', df.relationship_type,
      'display_order', df.display_order,
      'is_primary', df.is_primary,
      'file_exists', (
        -- Expensive file system check required for each file
        CASE WHEN pg_stat_file(fm.file_path) IS NOT NULL 
             THEN TRUE ELSE FALSE END
      ),
      'accessible', (
        -- Additional access control complexity
        CASE WHEN fm.access_level = 'public' OR fm.uploaded_by = $2
             THEN TRUE ELSE FALSE END
      )
    ) ORDER BY df.display_order
  ) FILTER (WHERE fm.file_id IS NOT NULL) as files,
  
  -- File statistics aggregation
  COUNT(fm.file_id) as file_count,
  SUM(fm.file_size) as total_file_size,
  MAX(fm.upload_timestamp) as latest_file_upload

FROM documents d
LEFT JOIN document_files df ON d.document_id = df.document_id
LEFT JOIN file_metadata fm ON df.file_id = fm.file_id 
  AND fm.processing_status = 'completed'
WHERE d.user_id = $1 
  AND d.status = 'active'
  AND (fm.access_level = 'public' OR fm.uploaded_by = $1 OR $1 IN (
    SELECT user_id FROM document_permissions 
    WHERE document_id = d.document_id AND permission_level IN ('read', 'write', 'admin')
  ))
GROUP BY d.document_id, d.title, d.content, d.created_at
ORDER BY d.created_at DESC
LIMIT 50;

-- Problems with traditional file storage approaches:
-- 1. File system and database synchronization complexity
-- 2. Backup and replication coordination between file system and database
-- 3. Transactional integrity challenges across file system and database operations
-- 4. Complex access control implementation across multiple storage layers
-- 5. Difficulty implementing file versioning and history tracking
-- 6. Storage location management and migration complexity
-- 7. Limited file metadata search and indexing capabilities
-- 8. Performance bottlenecks with large numbers of files
-- 9. Scalability challenges with distributed file storage
-- 10. Complex error handling and recovery across multiple storage systems

-- File upload handling complexity (application layer)
/*
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class TraditionalFileStorage {
  constructor(storageConfig) {
    this.storagePath = storageConfig.storagePath;
    this.maxFileSize = storageConfig.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.allowedTypes = storageConfig.allowedTypes || [];
    
    // Complex storage configuration
    this.storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const userDir = path.join(this.storagePath, req.user.id.toString());
        
        try {
          await fs.mkdir(userDir, { recursive: true });
          cb(null, userDir);
        } catch (error) {
          cb(error);
        }
      },
      
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
      }
    });
  }

  async handleFileUpload(req, res, next) {
    const upload = multer({
      storage: this.storage,
      limits: { fileSize: this.maxFileSize },
      fileFilter: (req, file, cb) => {
        if (this.allowedTypes.length > 0 && 
            !this.allowedTypes.includes(file.mimetype)) {
          cb(new Error('File type not allowed'));
          return;
        }
        cb(null, true);
      }
    }).array('files', 10);

    upload(req, res, async (err) => {
      if (err) {
        console.error('File upload error:', err);
        return res.status(400).json({ error: err.message });
      }

      try {
        // Complex file processing and database coordination
        const filePromises = req.files.map(async (file) => {
          // Calculate file hash
          const fileBuffer = await fs.readFile(file.path);
          const fileHash = crypto.createHash('sha256')
            .update(fileBuffer).digest('hex');

          // Database transaction complexity
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            // Insert file metadata
            const fileResult = await client.query(`
              INSERT INTO file_metadata (
                filename, original_filename, file_path, file_size, 
                content_type, uploaded_by, file_hash
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING file_id
            `, [
              file.filename,
              file.originalname,
              file.path,
              file.size,
              file.mimetype,
              req.user.id,
              fileHash
            ]);

            // Associate with document if specified
            if (req.body.document_id) {
              await client.query(`
                INSERT INTO document_files (
                  document_id, file_id, relationship_type, display_order
                ) VALUES ($1, $2, $3, $4)
              `, [
                req.body.document_id,
                fileResult.rows[0].file_id,
                req.body.relationship_type || 'attachment',
                parseInt(req.body.display_order) || 0
              ]);
            }

            await client.query('COMMIT');
            return {
              file_id: fileResult.rows[0].file_id,
              filename: file.filename,
              original_filename: file.originalname,
              file_size: file.size,
              content_type: file.mimetype
            };

          } catch (dbError) {
            await client.query('ROLLBACK');
            
            // Cleanup file on database error
            try {
              await fs.unlink(file.path);
            } catch (cleanupError) {
              console.error('File cleanup error:', cleanupError);
            }
            
            throw dbError;
          } finally {
            client.release();
          }
        });

        const uploadedFiles = await Promise.all(filePromises);
        res.json({ 
          success: true, 
          files: uploadedFiles,
          message: `${uploadedFiles.length} files uploaded successfully`
        });

      } catch (error) {
        console.error('File processing error:', error);
        res.status(500).json({ 
          error: 'File processing failed',
          details: error.message 
        });
      }
    });
  }

  async downloadFile(req, res) {
    try {
      const { file_id } = req.params;
      
      // Complex authorization and file access logic
      const fileQuery = `
        SELECT fm.*, dp.permission_level
        FROM file_metadata fm
        LEFT JOIN document_files df ON fm.file_id = df.file_id
        LEFT JOIN document_permissions dp ON df.document_id = dp.document_id 
          AND dp.user_id = $2
        WHERE fm.file_id = $1 
          AND (
            fm.is_public = true 
            OR fm.uploaded_by = $2 
            OR dp.permission_level IN ('read', 'write', 'admin')
          )
      `;
      
      const result = await pool.query(fileQuery, [file_id, req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'File not found or access denied' });
      }

      const fileMetadata = result.rows[0];
      
      // Check if file exists on file system
      try {
        await fs.access(fileMetadata.file_path);
      } catch (error) {
        console.error('File missing from file system:', error);
        return res.status(404).json({ 
          error: 'File not found on storage system' 
        });
      }

      // Update access tracking
      await pool.query(
        'UPDATE file_metadata SET last_accessed = CURRENT_TIMESTAMP WHERE file_id = $1',
        [file_id]
      );

      // Set response headers
      res.setHeader('Content-Type', fileMetadata.content_type);
      res.setHeader('Content-Length', fileMetadata.file_size);
      res.setHeader('Content-Disposition', 
        `inline; filename="${fileMetadata.original_filename}"`);

      // Stream file
      const fileStream = require('fs').createReadStream(fileMetadata.file_path);
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
        console.error('File streaming error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'File streaming failed' });
        }
      });

    } catch (error) {
      console.error('File download error:', error);
      res.status(500).json({ 
        error: 'File download failed',
        details: error.message 
      });
    }
  }
}

// Issues with traditional approach:
// 1. Complex file system and database coordination
// 2. Manual transaction management across storage layers
// 3. File cleanup complexity on errors
// 4. Limited streaming and chunking capabilities
// 5. Difficult backup and replication coordination
// 6. Complex access control across multiple systems
// 7. Manual file existence validation required
// 8. Limited metadata search capabilities
// 9. Scalability bottlenecks with large file counts
// 10. Error-prone manual file path management
*/
```

MongoDB GridFS provides comprehensive file storage with seamless integration:

```javascript
// MongoDB GridFS - comprehensive file storage with advanced patterns and seamless MongoDB integration
const { MongoClient, GridFSBucket } = require('mongodb');
const { Readable } = require('stream');
const crypto = require('crypto');
const mime = require('mime-types');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('advanced_file_management_platform');

// Advanced MongoDB GridFS file storage and management system
class AdvancedGridFSManager {
  constructor(db, options = {}) {
    this.db = db;
    this.collections = {
      documents: db.collection('documents'),
      users: db.collection('users'),
      fileAccess: db.collection('file_access_logs'),
      fileVersions: db.collection('file_versions'),
      fileSharing: db.collection('file_sharing')
    };
    
    // GridFS configuration for different file types and use cases
    this.gridFSBuckets = {
      // General file storage
      files: new GridFSBucket(db, { 
        bucketName: 'files',
        chunkSizeBytes: 255 * 1024 // 255KB chunks for optimal performance
      }),
      
      // Image storage with different chunk size for better streaming
      images: new GridFSBucket(db, {
        bucketName: 'images', 
        chunkSizeBytes: 512 * 1024 // 512KB chunks for large images
      }),
      
      // Video storage optimized for streaming
      videos: new GridFSBucket(db, {
        bucketName: 'videos',
        chunkSizeBytes: 1024 * 1024 // 1MB chunks for video streaming
      }),
      
      // Document storage for PDFs, Office files, etc.
      documents: new GridFSBucket(db, {
        bucketName: 'documents',
        chunkSizeBytes: 128 * 1024 // 128KB chunks for document files
      }),
      
      // Archive storage for compressed files
      archives: new GridFSBucket(db, {
        bucketName: 'archives',
        chunkSizeBytes: 2048 * 1024 // 2MB chunks for large archives
      })
    };
    
    // Advanced file management configuration
    this.config = {
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB default
      allowedMimeTypes: options.allowedMimeTypes || [],
      enableVersioning: options.enableVersioning !== false,
      enableThumbnails: options.enableThumbnails !== false,
      enableVirusScanning: options.enableVirusScanning || false,
      compressionEnabled: options.compressionEnabled || false,
      encryptionEnabled: options.encryptionEnabled || false,
      accessLogging: options.accessLogging !== false,
      automaticCleanup: options.automaticCleanup !== false
    };
    
    // File processing pipelines
    this.processors = new Map();
    this.thumbnailGenerators = new Map();
    this.metadataExtractors = new Map();
    
    this.setupFileProcessors();
    this.setupMetadataExtractors();
    this.setupThumbnailGenerators();
  }

  async uploadFile(fileStream, metadata, options = {}) {
    console.log(`Uploading file: ${metadata.filename}`);
    
    try {
      // Validate file and metadata
      const validationResult = await this.validateFileUpload(fileStream, metadata, options);
      if (!validationResult.valid) {
        throw new Error(`File validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Determine appropriate GridFS bucket based on file type
      const bucketName = this.determineBucket(metadata.contentType);
      const gridFSBucket = this.gridFSBuckets[bucketName];
      
      // Enhanced metadata with comprehensive file information
      const enhancedMetadata = {
        // Original metadata
        filename: metadata.filename,
        contentType: metadata.contentType || mime.lookup(metadata.filename) || 'application/octet-stream',
        
        // File characteristics
        originalSize: metadata.size,
        uploadedAt: new Date(),
        uploadedBy: metadata.uploadedBy,
        
        // Advanced metadata
        fileHash: null, // Will be calculated during upload
        bucketName: bucketName,
        chunkSize: gridFSBucket.s.options.chunkSizeBytes,
        
        // Application context
        documentId: metadata.documentId,
        projectId: metadata.projectId,
        organizationId: metadata.organizationId,
        
        // Access control and permissions
        accessLevel: metadata.accessLevel || 'private',
        permissions: metadata.permissions || {},
        isPublic: metadata.isPublic || false,
        
        // File relationships and organization
        category: metadata.category || 'general',
        tags: metadata.tags || [],
        description: metadata.description,
        
        // Versioning information
        version: options.version || 1,
        parentFileId: metadata.parentFileId,
        versionHistory: [],
        
        // Processing status
        processingStatus: 'uploading',
        processingSteps: [],
        
        // Performance and optimization
        compressionApplied: false,
        encryptionApplied: false,
        thumbnailGenerated: false,
        metadataExtracted: false,
        
        // Usage tracking
        downloadCount: 0,
        lastAccessed: null,
        lastModified: new Date(),
        
        // Storage optimization
        storageOptimized: false,
        deduplicationChecked: false,
        duplicateOf: null,
        
        // Custom metadata fields
        customMetadata: metadata.customMetadata || {}
      };

      // Create upload stream with comprehensive error handling
      const uploadStream = gridFSBucket.openUploadStream(metadata.filename, {
        metadata: enhancedMetadata,
        
        // Advanced GridFS options
        chunkSizeBytes: gridFSBucket.s.options.chunkSizeBytes,
        disableMD5: false, // Enable MD5 for file integrity
      });

      // File processing pipeline setup
      let fileHash = crypto.createHash('sha256');
      let totalBytes = 0;
      let compressionStream = null;
      let encryptionStream = null;

      // Setup processing streams if enabled
      if (this.config.compressionEnabled && this.shouldCompress(metadata.contentType)) {
        compressionStream = this.createCompressionStream();
      }
      
      if (this.config.encryptionEnabled && metadata.encrypted) {
        encryptionStream = this.createEncryptionStream(metadata.encryptionKey);
      }

      // Promise-based upload handling with comprehensive progress tracking
      return new Promise((resolve, reject) => {
        let processingChain = fileStream;
        
        // Build processing chain
        if (compressionStream) {
          processingChain = processingChain.pipe(compressionStream);
        }
        
        if (encryptionStream) {
          processingChain = processingChain.pipe(encryptionStream);
        }

        // File data processing during upload
        processingChain.on('data', (chunk) => {
          fileHash.update(chunk);
          totalBytes += chunk.length;
          
          // Emit progress events
          this.emit('uploadProgress', {
            filename: metadata.filename,
            bytesUploaded: totalBytes,
            totalBytes: metadata.size,
            progress: metadata.size ? (totalBytes / metadata.size) * 100 : 0
          });
        });

        // Stream to GridFS
        processingChain.pipe(uploadStream);

        uploadStream.on('error', async (error) => {
          console.error(`GridFS upload error for ${metadata.filename}:`, error);
          
          // Cleanup partial upload
          try {
            await this.cleanupFailedUpload(uploadStream.id, bucketName);
          } catch (cleanupError) {
            console.error('Upload cleanup error:', cleanupError);
          }
          
          reject(error);
        });

        uploadStream.on('finish', async () => {
          try {
            console.log(`File upload completed: ${metadata.filename} (${uploadStream.id})`);
            
            // Update file metadata with calculated information
            const calculatedHash = fileHash.digest('hex');
            
            const updateResult = await this.collections.files.updateOne(
              { _id: uploadStream.id },
              {
                $set: {
                  'metadata.fileHash': calculatedHash,
                  'metadata.actualSize': totalBytes,
                  'metadata.compressionApplied': compressionStream !== null,
                  'metadata.encryptionApplied': encryptionStream !== null,
                  'metadata.processingStatus': 'uploaded',
                  'metadata.uploadCompletedAt': new Date()
                }
              }
            );

            // Check for duplicate files based on hash
            const duplicateCheck = await this.checkForDuplicates(calculatedHash, uploadStream.id);
            
            // Post-upload processing
            const postProcessingTasks = [
              this.extractFileMetadata(uploadStream.id, bucketName, metadata.contentType),
              this.generateThumbnails(uploadStream.id, bucketName, metadata.contentType),
              this.performVirusScanning(uploadStream.id, bucketName),
              this.logFileAccess(uploadStream.id, 'upload', metadata.uploadedBy),
              this.updateFileVersionHistory(uploadStream.id, metadata.parentFileId),
              this.triggerFileWebhooks(uploadStream.id, 'file.uploaded')
            ];

            // Execute post-processing tasks
            const processingResults = await Promise.allSettled(postProcessingTasks);
            
            // Track processing failures
            const failedProcessing = processingResults
              .filter(result => result.status === 'rejected')
              .map(result => result.reason);

            if (failedProcessing.length > 0) {
              console.warn(`Post-processing warnings for ${metadata.filename}:`, failedProcessing);
            }

            // Final file information
            const fileInfo = {
              fileId: uploadStream.id,
              filename: metadata.filename,
              contentType: metadata.contentType,
              size: totalBytes,
              uploadedAt: new Date(),
              fileHash: calculatedHash,
              bucketName: bucketName,
              gridFSId: uploadStream.id,
              
              // Processing results
              processingStatus: failedProcessing.length === 0 ? 'completed' : 'completed_with_warnings',
              processingWarnings: failedProcessing,
              
              // Duplication information
              duplicateInfo: duplicateCheck,
              
              // URLs for file access
              downloadUrl: this.generateDownloadUrl(uploadStream.id, bucketName),
              streamUrl: this.generateStreamUrl(uploadStream.id, bucketName),
              thumbnailUrl: metadata.contentType.startsWith('image/') ? 
                this.generateThumbnailUrl(uploadStream.id) : null,
              
              // Metadata
              metadata: enhancedMetadata
            };

            // Update processing status
            await this.collections.files.updateOne(
              { _id: uploadStream.id },
              {
                $set: {
                  'metadata.processingStatus': fileInfo.processingStatus,
                  'metadata.processingCompletedAt': new Date(),
                  'metadata.processingWarnings': failedProcessing
                }
              }
            );

            resolve(fileInfo);

          } catch (error) {
            console.error(`Post-upload processing error for ${metadata.filename}:`, error);
            reject(error);
          }
        });
      });

    } catch (error) {
      console.error(`File upload error for ${metadata.filename}:`, error);
      throw error;
    }
  }

  async downloadFile(fileId, options = {}) {
    console.log(`Downloading file: ${fileId}`);
    
    try {
      // Get file information
      const fileInfo = await this.getFileInfo(fileId);
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Authorization check
      if (options.userId) {
        const authorized = await this.checkFileAccess(fileId, options.userId, 'read');
        if (!authorized) {
          throw new Error('Access denied');
        }
      }

      // Determine appropriate bucket
      const bucketName = fileInfo.metadata?.bucketName || 'files';
      const gridFSBucket = this.gridFSBuckets[bucketName];

      // Create download stream
      const downloadStream = gridFSBucket.openDownloadStream(fileId);
      
      // Setup stream processing if needed
      let processingChain = downloadStream;
      
      if (fileInfo.metadata?.encryptionApplied && options.decryptionKey) {
        const decryptionStream = this.createDecryptionStream(options.decryptionKey);
        processingChain = processingChain.pipe(decryptionStream);
      }
      
      if (fileInfo.metadata?.compressionApplied) {
        const decompressionStream = this.createDecompressionStream();
        processingChain = processingChain.pipe(decompressionStream);
      }

      // Log file access
      if (options.userId) {
        await this.logFileAccess(fileId, 'download', options.userId);
        
        // Update access statistics
        await this.collections.files.updateOne(
          { _id: fileId },
          {
            $inc: { 'metadata.downloadCount': 1 },
            $set: { 'metadata.lastAccessed': new Date() }
          }
        );
      }

      // Return stream with file information
      return {
        stream: processingChain,
        fileInfo: fileInfo,
        contentType: fileInfo.contentType,
        contentLength: fileInfo.length,
        filename: fileInfo.filename,
        
        // Additional headers for HTTP response
        headers: {
          'Content-Type': fileInfo.contentType,
          'Content-Length': fileInfo.length,
          'Content-Disposition': `${options.disposition || 'inline'}; filename="${fileInfo.filename}"`,
          'Cache-Control': options.cacheControl || 'private, max-age=3600',
          'ETag': fileInfo.metadata?.fileHash,
          'Last-Modified': fileInfo.uploadDate.toUTCString()
        }
      };

    } catch (error) {
      console.error(`File download error for ${fileId}:`, error);
      throw error;
    }
  }

  async searchFiles(query, options = {}) {
    console.log(`Searching files with query:`, query);
    
    try {
      // Build comprehensive search pipeline
      const searchPipeline = [
        // Stage 1: Initial filtering based on search criteria
        {
          $match: {
            ...this.buildFileSearchFilter(query, options),
            // Ensure we're searching in the files collection
            filename: { $exists: true }
          }
        },
        
        // Stage 2: Add computed fields for search relevance
        {
          $addFields: {
            // Text search relevance scoring
            textScore: {
              $cond: {
                if: { $ne: [query.text, null] },
                then: {
                  $add: [
                    // Filename match weight
                    { $cond: { 
                      if: { $regexMatch: { input: '$filename', regex: query.text, options: 'i' } },
                      then: 10, else: 0 
                    }},
                    // Description match weight
                    { $cond: { 
                      if: { $regexMatch: { input: '$metadata.description', regex: query.text, options: 'i' } },
                      then: 5, else: 0 
                    }},
                    // Tags match weight
                    { $cond: { 
                      if: { $in: [query.text, '$metadata.tags'] },
                      then: 8, else: 0 
                    }},
                    // Category match weight
                    { $cond: { 
                      if: { $regexMatch: { input: '$metadata.category', regex: query.text, options: 'i' } },
                      then: 3, else: 0 
                    }}
                  ]
                },
                else: 0
              }
            },
            
            // Recency scoring (newer files get higher scores)
            recencyScore: {
              $divide: [
                { $subtract: [new Date(), '$uploadDate'] },
                86400000 // Convert to days
              ]
            },
            
            // Popularity scoring based on download count
            popularityScore: {
              $multiply: [
                { $log10: { $add: ['$metadata.downloadCount', 1] } },
                2
              ]
            },
            
            // Size category for filtering
            sizeCategory: {
              $switch: {
                branches: [
                  { case: { $lt: ['$length', 1024 * 1024] }, then: 'small' }, // < 1MB
                  { case: { $lt: ['$length', 10 * 1024 * 1024] }, then: 'medium' }, // < 10MB
                  { case: { $lt: ['$length', 100 * 1024 * 1024] }, then: 'large' }, // < 100MB
                ],
                default: 'very_large'
              }
            }
          }
        },
        
        // Stage 3: Apply advanced filtering
        {
          $match: {
            ...(query.sizeCategory && { sizeCategory: query.sizeCategory }),
            ...(query.minScore && { textScore: { $gte: query.minScore } })
          }
        },
        
        // Stage 4: Lookup related document information if file is associated
        {
          $lookup: {
            from: 'documents',
            localField: 'metadata.documentId',
            foreignField: '_id',
            as: 'documentInfo',
            pipeline: [
              {
                $project: {
                  title: 1,
                  status: 1,
                  createdBy: 1,
                  projectId: 1
                }
              }
            ]
          }
        },
        
        // Stage 5: Lookup user information for uploaded_by
        {
          $lookup: {
            from: 'users',
            localField: 'metadata.uploadedBy',
            foreignField: '_id',
            as: 'uploaderInfo',
            pipeline: [
              {
                $project: {
                  name: 1,
                  email: 1,
                  avatar: 1
                }
              }
            ]
          }
        },
        
        // Stage 6: Calculate final relevance score
        {
          $addFields: {
            relevanceScore: {
              $add: [
                '$textScore',
                { $divide: ['$popularityScore', 4] },
                { $cond: { if: { $lt: ['$recencyScore', 30] }, then: 5, else: 0 } }, // Bonus for files < 30 days old
                { $cond: { if: { $gt: [{ $size: '$documentInfo' }, 0] }, then: 2, else: 0 } } // Bonus for associated files
              ]
            }
          }
        },
        
        // Stage 7: Project final result structure
        {
          $project: {
            fileId: '$_id',
            filename: 1,
            contentType: 1,
            length: 1,
            uploadDate: 1,
            
            // Metadata information
            category: '$metadata.category',
            tags: '$metadata.tags',
            description: '$metadata.description',
            accessLevel: '$metadata.accessLevel',
            isPublic: '$metadata.isPublic',
            
            // File characteristics
            fileHash: '$metadata.fileHash',
            bucketName: '$metadata.bucketName',
            downloadCount: '$metadata.downloadCount',
            lastAccessed: '$metadata.lastAccessed',
            
            // Processing status
            processingStatus: '$metadata.processingStatus',
            thumbnailGenerated: '$metadata.thumbnailGenerated',
            
            // Computed scores
            textScore: 1,
            popularityScore: 1,
            relevanceScore: 1,
            sizeCategory: 1,
            
            // Related information
            documentInfo: { $arrayElemAt: ['$documentInfo', 0] },
            uploaderInfo: { $arrayElemAt: ['$uploaderInfo', 0] },
            
            // Access URLs
            downloadUrl: {
              $concat: [
                '/api/files/',
                { $toString: '$_id' },
                '/download'
              ]
            },
            
            thumbnailUrl: {
              $cond: {
                if: { $eq: ['$metadata.thumbnailGenerated', true] },
                then: {
                  $concat: [
                    '/api/files/',
                    { $toString: '$_id' },
                    '/thumbnail'
                  ]
                },
                else: null
              }
            },
            
            // Formatted file information
            formattedSize: {
              $switch: {
                branches: [
                  { 
                    case: { $lt: ['$length', 1024] },
                    then: { $concat: [{ $toString: '$length' }, ' bytes'] }
                  },
                  { 
                    case: { $lt: ['$length', 1024 * 1024] },
                    then: { 
                      $concat: [
                        { $toString: { $round: [{ $divide: ['$length', 1024] }, 1] } },
                        ' KB'
                      ]
                    }
                  },
                  { 
                    case: { $lt: ['$length', 1024 * 1024 * 1024] },
                    then: { 
                      $concat: [
                        { $toString: { $round: [{ $divide: ['$length', 1024 * 1024] }, 1] } },
                        ' MB'
                      ]
                    }
                  }
                ],
                default: { 
                  $concat: [
                    { $toString: { $round: [{ $divide: ['$length', 1024 * 1024 * 1024] }, 1] } },
                    ' GB'
                  ]
                }
              }
            }
          }
        },
        
        // Stage 8: Sort by relevance and apply pagination
        { $sort: this.buildSearchSort(options.sortBy, options.sortOrder) },
        { $skip: options.skip || 0 },
        { $limit: options.limit || 20 }
      ];

      // Execute search pipeline
      const searchResults = await this.db.collection('fs.files').aggregate(searchPipeline).toArray();
      
      // Get total count for pagination
      const totalCountPipeline = [
        { $match: this.buildFileSearchFilter(query, options) },
        { $count: 'total' }
      ];
      
      const countResult = await this.db.collection('fs.files').aggregate(totalCountPipeline).toArray();
      const totalCount = countResult.length > 0 ? countResult[0].total : 0;

      return {
        files: searchResults,
        pagination: {
          total: totalCount,
          page: Math.floor((options.skip || 0) / (options.limit || 20)) + 1,
          limit: options.limit || 20,
          pages: Math.ceil(totalCount / (options.limit || 20))
        },
        query: query,
        searchTime: Date.now() - (options.startTime || Date.now()),
        
        // Search analytics
        analytics: {
          averageRelevanceScore: searchResults.length > 0 ? 
            searchResults.reduce((sum, file) => sum + file.relevanceScore, 0) / searchResults.length : 0,
          categoryDistribution: this.analyzeCategoryDistribution(searchResults),
          sizeDistribution: this.analyzeSizeDistribution(searchResults),
          contentTypeDistribution: this.analyzeContentTypeDistribution(searchResults)
        }
      };

    } catch (error) {
      console.error('File search error:', error);
      throw error;
    }
  }

  async manageFileVersions(fileId, operation, options = {}) {
    console.log(`Managing file versions for ${fileId}, operation: ${operation}`);
    
    try {
      switch (operation) {
        case 'create_version':
          return await this.createFileVersion(fileId, options);
          
        case 'list_versions':
          return await this.listFileVersions(fileId, options);
          
        case 'restore_version':
          return await this.restoreFileVersion(fileId, options.versionId);
          
        case 'delete_version':
          return await this.deleteFileVersion(fileId, options.versionId);
          
        case 'compare_versions':
          return await this.compareFileVersions(fileId, options.versionId1, options.versionId2);
          
        default:
          throw new Error(`Unknown version operation: ${operation}`);
      }
    } catch (error) {
      console.error(`File version management error for ${fileId}:`, error);
      throw error;
    }
  }

  async createFileVersion(originalFileId, options) {
    console.log(`Creating new version for file: ${originalFileId}`);
    
    const session = this.db.client.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Get original file information
        const originalFile = await this.getFileInfo(originalFileId);
        if (!originalFile) {
          throw new Error(`Original file not found: ${originalFileId}`);
        }

        // Create new version metadata
        const versionMetadata = {
          ...originalFile.metadata,
          version: (originalFile.metadata?.version || 1) + 1,
          parentFileId: originalFileId,
          versionCreatedAt: new Date(),
          versionCreatedBy: options.userId,
          versionNotes: options.versionNotes,
          isCurrentVersion: true
        };

        // Upload new version
        const newVersionInfo = await this.uploadFile(options.fileStream, versionMetadata, {
          version: versionMetadata.version
        });

        // Update original file to mark as not current
        await this.collections.files.updateOne(
          { _id: originalFileId },
          {
            $set: { 'metadata.isCurrentVersion': false },
            $push: {
              'metadata.versionHistory': {
                versionId: newVersionInfo.fileId,
                version: versionMetadata.version,
                createdAt: versionMetadata.versionCreatedAt,
                createdBy: versionMetadata.versionCreatedBy,
                notes: versionMetadata.versionNotes
              }
            }
          }
        );

        // Update version references in related documents
        if (originalFile.metadata?.documentId) {
          await this.collections.documents.updateMany(
            { 'files.fileId': originalFileId },
            {
              $set: { 'files.$.fileId': newVersionInfo.fileId },
              $push: {
                'files.$.versionHistory': {
                  previousFileId: originalFileId,
                  newFileId: newVersionInfo.fileId,
                  versionedAt: new Date(),
                  versionedBy: options.userId
                }
              }
            }
          );
        }

        return newVersionInfo;
      });

    } catch (error) {
      console.error(`File version creation error for ${originalFileId}:`, error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Helper methods for advanced file processing

  determineBucket(contentType) {
    if (contentType.startsWith('image/')) return 'images';
    if (contentType.startsWith('video/')) return 'videos';
    if (contentType.includes('pdf') || 
        contentType.includes('document') || 
        contentType.includes('word') || 
        contentType.includes('excel') || 
        contentType.includes('powerpoint')) return 'documents';
    if (contentType.includes('zip') || 
        contentType.includes('tar') || 
        contentType.includes('compress')) return 'archives';
    return 'files';
  }

  async validateFileUpload(fileStream, metadata, options) {
    const errors = [];
    
    // Size validation
    if (metadata.size > this.config.maxFileSize) {
      errors.push(`File size ${metadata.size} exceeds maximum ${this.config.maxFileSize}`);
    }
    
    // MIME type validation
    if (this.config.allowedMimeTypes.length > 0 && 
        !this.config.allowedMimeTypes.includes(metadata.contentType)) {
      errors.push(`Content type ${metadata.contentType} is not allowed`);
    }
    
    // Filename validation
    if (!metadata.filename || metadata.filename.trim().length === 0) {
      errors.push('Filename is required');
    }
    
    return { valid: errors.length === 0, errors };
  }

  buildFileSearchFilter(query, options) {
    const filter = {};
    
    // Text search across multiple fields
    if (query.text) {
      filter.$or = [
        { filename: { $regex: query.text, $options: 'i' } },
        { 'metadata.description': { $regex: query.text, $options: 'i' } },
        { 'metadata.tags': { $in: [new RegExp(query.text, 'i')] } },
        { 'metadata.category': { $regex: query.text, $options: 'i' } }
      ];
    }
    
    // Content type filtering
    if (query.contentType) {
      if (Array.isArray(query.contentType)) {
        filter.contentType = { $in: query.contentType };
      } else {
        filter.contentType = { $regex: query.contentType, $options: 'i' };
      }
    }
    
    // Date range filtering
    if (query.uploadedAfter || query.uploadedBefore) {
      filter.uploadDate = {};
      if (query.uploadedAfter) filter.uploadDate.$gte = new Date(query.uploadedAfter);
      if (query.uploadedBefore) filter.uploadDate.$lte = new Date(query.uploadedBefore);
    }
    
    // Size range filtering
    if (query.minSize || query.maxSize) {
      filter.length = {};
      if (query.minSize) filter.length.$gte = query.minSize;
      if (query.maxSize) filter.length.$lte = query.maxSize;
    }
    
    // Category filtering
    if (query.category) {
      filter['metadata.category'] = query.category;
    }
    
    // Tags filtering
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      filter['metadata.tags'] = { $in: tags };
    }
    
    // Uploader filtering
    if (query.uploadedBy) {
      filter['metadata.uploadedBy'] = query.uploadedBy;
    }
    
    // Access level filtering
    if (query.accessLevel) {
      filter['metadata.accessLevel'] = query.accessLevel;
    }
    
    // Document association filtering
    if (query.documentId) {
      filter['metadata.documentId'] = query.documentId;
    }
    
    // Processing status filtering
    if (query.processingStatus) {
      filter['metadata.processingStatus'] = query.processingStatus;
    }
    
    return filter;
  }

  buildSearchSort(sortBy = 'relevance', sortOrder = 'desc') {
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    
    switch (sortBy) {
      case 'relevance':
        return { relevanceScore: -1, uploadDate: -1 };
      case 'name':
        return { filename: sortDirection };
      case 'size':
        return { length: sortDirection };
      case 'date':
        return { uploadDate: sortDirection };
      case 'popularity':
        return { popularityScore: -1, uploadDate: -1 };
      case 'type':
        return { contentType: sortDirection, filename: 1 };
      default:
        return { relevanceScore: -1, uploadDate: -1 };
    }
  }

  setupFileProcessors() {
    // Image processing
    this.processors.set('image', async (fileId, contentType) => {
      // Implement image processing (resize, optimize, etc.)
      console.log(`Processing image: ${fileId}`);
    });
    
    // Document processing
    this.processors.set('document', async (fileId, contentType) => {
      // Implement document processing (text extraction, etc.)
      console.log(`Processing document: ${fileId}`);
    });
    
    // Video processing
    this.processors.set('video', async (fileId, contentType) => {
      // Implement video processing (thumbnail, compression, etc.)
      console.log(`Processing video: ${fileId}`);
    });
  }

  setupThumbnailGenerators() {
    // Image thumbnail generation
    this.thumbnailGenerators.set('image', async (fileId) => {
      console.log(`Generating image thumbnail for: ${fileId}`);
      // Implement image thumbnail generation
    });
    
    // PDF thumbnail generation
    this.thumbnailGenerators.set('pdf', async (fileId) => {
      console.log(`Generating PDF thumbnail for: ${fileId}`);
      // Implement PDF thumbnail generation
    });
  }

  setupMetadataExtractors() {
    // Image metadata extraction (EXIF, etc.)
    this.metadataExtractors.set('image', async (fileId) => {
      console.log(`Extracting image metadata for: ${fileId}`);
      // Implement EXIF and other metadata extraction
    });
    
    // Document metadata extraction
    this.metadataExtractors.set('document', async (fileId) => {
      console.log(`Extracting document metadata for: ${fileId}`);
      // Implement document properties extraction
    });
  }
}

// Benefits of MongoDB GridFS Advanced File Management:
// - Seamless integration with MongoDB data model and queries
// - Automatic file chunking and streaming for large files
// - Built-in file versioning and history tracking
// - Comprehensive metadata management and search capabilities
// - Advanced file processing pipelines and thumbnail generation
// - Integrated access control and permission management
// - Automatic backup and replication with MongoDB cluster
// - Sophisticated file search with relevance scoring
// - Real-time file access logging and analytics
// - SQL-compatible file operations through QueryLeaf integration

module.exports = {
  AdvancedGridFSManager
};
```

## Understanding MongoDB GridFS Architecture

### Advanced File Storage Patterns and Integration Strategies

Implement sophisticated GridFS patterns for production-scale applications:

```javascript
// Production-ready GridFS management with advanced patterns and optimization
class ProductionGridFSManager extends AdvancedGridFSManager {
  constructor(db, productionConfig) {
    super(db);
    
    this.productionConfig = {
      ...productionConfig,
      replicationEnabled: true,
      shardingOptimized: true,
      compressionEnabled: true,
      encryptionEnabled: productionConfig.encryptionEnabled || false,
      cdnIntegration: productionConfig.cdnIntegration || false,
      virusScanning: productionConfig.virusScanning || false,
      contentDelivery: productionConfig.contentDelivery || false
    };
    
    this.setupProductionOptimizations();
    this.setupMonitoringAndAlerts();
    this.setupCDNIntegration();
  }

  async implementFileStorageStrategy(storageRequirements) {
    console.log('Implementing production file storage strategy...');
    
    const strategy = {
      storageDistribution: await this.designStorageDistribution(storageRequirements),
      performanceOptimization: await this.implementPerformanceOptimizations(storageRequirements),
      securityMeasures: await this.implementSecurityMeasures(storageRequirements),
      monitoringSetup: await this.setupComprehensiveMonitoring(storageRequirements),
      backupStrategy: await this.designBackupStrategy(storageRequirements)
    };

    return {
      strategy: strategy,
      implementation: await this.executeStorageStrategy(strategy),
      validation: await this.validateStorageImplementation(strategy),
      documentation: this.generateStorageDocumentation(strategy)
    };
  }

  async setupAdvancedFileCaching(cachingConfig) {
    console.log('Setting up advanced file caching system...');
    
    const cachingStrategy = {
      // Multi-tier caching
      tiers: [
        {
          name: 'memory',
          type: 'redis',
          capacity: '2GB',
          ttl: 3600, // 1 hour
          priority: ['images', 'thumbnails', 'frequently_accessed']
        },
        {
          name: 'disk',
          type: 'filesystem',
          capacity: '100GB',
          ttl: 86400, // 24 hours
          priority: ['documents', 'archives', 'medium_access']
        },
        {
          name: 'cdn',
          type: 'cloudfront',
          capacity: 'unlimited',
          ttl: 604800, // 7 days
          priority: ['public_files', 'static_content']
        }
      ],
      
      // Intelligent prefetching
      prefetchingRules: [
        {
          condition: 'user_documents',
          action: 'prefetch_related_files',
          priority: 'high'
        },
        {
          condition: 'popular_content',
          action: 'cache_preemptively',
          priority: 'medium'
        }
      ],
      
      // Cache invalidation strategies
      invalidationRules: [
        {
          trigger: 'file_updated',
          action: 'invalidate_all_versions',
          scope: 'global'
        },
        {
          trigger: 'permission_changed',
          action: 'invalidate_user_cache',
          scope: 'user_specific'
        }
      ]
    };

    return await this.implementCachingStrategy(cachingStrategy);
  }

  async manageFileLifecycle(lifecycleConfig) {
    console.log('Managing file lifecycle policies...');
    
    const lifecyclePolicies = {
      // Automatic archival policies
      archival: [
        {
          name: 'inactive_files',
          condition: { lastAccessed: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
          action: 'move_to_cold_storage',
          schedule: 'daily'
        },
        {
          name: 'large_old_files',
          condition: { 
            uploadDate: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
            length: { $gt: 100 * 1024 * 1024 }
          },
          action: 'compress_and_archive',
          schedule: 'weekly'
        }
      ],
      
      // Cleanup policies
      cleanup: [
        {
          name: 'temp_files',
          condition: { 
            'metadata.category': 'temporary',
            uploadDate: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          },
          action: 'delete',
          schedule: 'hourly'
        },
        {
          name: 'orphaned_versions',
          condition: { 'metadata.parentFileId': { $exists: true, $nin: [] } },
          action: 'cleanup_orphaned',
          schedule: 'daily'
        }
      ],
      
      // Optimization policies
      optimization: [
        {
          name: 'duplicate_detection',
          condition: { 'metadata.deduplicationChecked': { $ne: true } },
          action: 'check_duplicates',
          schedule: 'continuous'
        },
        {
          name: 'compression_optimization',
          condition: { 
            contentType: { $in: ['image/png', 'image/jpeg', 'image/tiff'] },
            'metadata.compressionApplied': { $ne: true },
            length: { $gt: 1024 * 1024 }
          },
          action: 'apply_compression',
          schedule: 'daily'
        }
      ]
    };

    return await this.implementLifecyclePolicies(lifecyclePolicies);
  }
}
```

## SQL-Style GridFS Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB GridFS operations and file management:

```sql
-- QueryLeaf advanced file storage and GridFS management with SQL-familiar syntax

-- Create file storage with GridFS configuration
CREATE FILE_STORAGE advanced_file_system 
USING GRIDFS (
  bucket_name = 'application_files',
  chunk_size = 255 * 1024, -- 255KB chunks for optimal performance
  
  -- Advanced GridFS configuration
  enable_md5 = true,
  enable_compression = true,
  compression_algorithm = 'zlib',
  encryption_enabled = false,
  
  -- Storage optimization
  auto_deduplication = true,
  thumbnail_generation = true,
  metadata_extraction = true,
  
  -- Performance tuning
  read_preference = 'secondaryPreferred',
  write_concern = { w: 'majority', j: true },
  max_time_ms = 30000
);

-- Upload files with comprehensive metadata management
INSERT INTO files (
  filename,
  content_type,
  file_data,
  metadata
) VALUES (
  'project_proposal.pdf',
  'application/pdf',
  LOAD_FILE('/path/to/project_proposal.pdf'),
  {
    category: 'documents',
    tags: ['project', 'proposal', 'business'],
    description: 'Q4 project proposal document',
    access_level: 'team',
    project_id: '507f1f77bcf86cd799439011',
    uploaded_by: '507f1f77bcf86cd799439012',
    
    -- Custom metadata fields
    document_type: 'proposal',
    confidentiality: 'internal',
    review_required: true,
    expiry_date: DATE_ADD(CURRENT_DATE, INTERVAL 1 YEAR),
    
    -- Processing options
    generate_thumbnail: true,
    extract_text: true,
    enable_versioning: true,
    compression_level: 'medium'
  }
),
(
  'user_avatar.jpg',
  'image/jpeg', 
  LOAD_FILE('/path/to/avatar.jpg'),
  {
    category: 'images',
    tags: ['avatar', 'profile', 'user'],
    description: 'User profile avatar image',
    access_level: 'public',
    user_id: '507f1f77bcf86cd799439013',
    uploaded_by: '507f1f77bcf86cd799439013',
    
    -- Image-specific metadata
    image_type: 'avatar',
    max_width: 200,
    max_height: 200,
    quality: 85,
    
    -- Processing options  
    generate_thumbnails: ['small', 'medium', 'large'],
    extract_exif: true,
    auto_optimize: true
  }
);

-- Advanced file search with comprehensive filtering and relevance scoring
SELECT 
  f.file_id,
  f.filename,
  f.content_type,
  f.file_size,
  f.upload_date,
  f.download_count,
  f.metadata,
  
  -- File access URLs
  CONCAT('/api/files/', f.file_id, '/download') as download_url,
  CONCAT('/api/files/', f.file_id, '/stream') as stream_url,
  
  -- Conditional thumbnail URL
  CASE 
    WHEN f.content_type LIKE 'image/%' AND f.metadata.thumbnail_generated = true THEN
      CONCAT('/api/files/', f.file_id, '/thumbnail')
    ELSE NULL
  END as thumbnail_url,
  
  -- File size formatting
  CASE 
    WHEN f.file_size < 1024 THEN CONCAT(f.file_size, ' bytes')
    WHEN f.file_size < 1024 * 1024 THEN CONCAT(ROUND(f.file_size / 1024.0, 1), ' KB')
    WHEN f.file_size < 1024 * 1024 * 1024 THEN CONCAT(ROUND(f.file_size / (1024.0 * 1024), 1), ' MB')
    ELSE CONCAT(ROUND(f.file_size / (1024.0 * 1024 * 1024), 1), ' GB')
  END as formatted_size,
  
  -- Search relevance scoring
  (
    -- Filename match weight (highest)
    CASE WHEN f.filename ILIKE '%proposal%' THEN 10 ELSE 0 END +
    
    -- Description match weight
    CASE WHEN f.metadata.description ILIKE '%proposal%' THEN 5 ELSE 0 END +
    
    -- Tags match weight  
    CASE WHEN 'proposal' = ANY(f.metadata.tags) THEN 8 ELSE 0 END +
    
    -- Category match weight
    CASE WHEN f.metadata.category ILIKE '%proposal%' THEN 3 ELSE 0 END +
    
    -- Recency bonus (files uploaded within last 30 days)
    CASE WHEN f.upload_date > CURRENT_DATE - INTERVAL '30 days' THEN 5 ELSE 0 END +
    
    -- Popularity bonus (files with high download count)
    LEAST(LOG(f.download_count + 1) * 2, 10) +
    
    -- Access level bonus (public files get slight boost)
    CASE WHEN f.metadata.access_level = 'public' THEN 2 ELSE 0 END
    
  ) as relevance_score,
  
  -- File status and health
  CASE 
    WHEN f.metadata.processing_status = 'completed' THEN 'ready'
    WHEN f.metadata.processing_status = 'processing' THEN 'processing'  
    WHEN f.metadata.processing_status = 'failed' THEN 'error'
    ELSE 'unknown'
  END as file_status,
  
  -- Associated document information
  d.title as document_title,
  d.project_id,
  
  -- Uploader information
  u.name as uploaded_by_name,
  u.email as uploaded_by_email

FROM files f
LEFT JOIN documents d ON f.metadata.document_id = d.document_id
LEFT JOIN users u ON f.metadata.uploaded_by = u.user_id

WHERE 
  -- Text search across multiple fields
  (
    f.filename ILIKE '%proposal%' 
    OR f.metadata.description ILIKE '%proposal%'
    OR 'proposal' = ANY(f.metadata.tags)
    OR f.metadata.category ILIKE '%proposal%'
  )
  
  -- Content type filtering
  AND f.content_type IN ('application/pdf', 'application/msword', 'text/plain')
  
  -- Date range filtering
  AND f.upload_date >= CURRENT_DATE - INTERVAL '1 year'
  
  -- Size filtering (between 1KB and 50MB)
  AND f.file_size BETWEEN 1024 AND 50 * 1024 * 1024
  
  -- Access level filtering (user can access)
  AND (
    f.metadata.access_level = 'public'
    OR f.metadata.uploaded_by = CURRENT_USER_ID()
    OR CURRENT_USER_ID() IN (
      SELECT user_id FROM file_permissions 
      WHERE file_id = f.file_id AND permission_level IN ('read', 'write', 'admin')
    )
  )
  
  -- Processing status filtering
  AND f.metadata.processing_status = 'completed'
  
  -- Project-based filtering (if specified)
  AND (f.metadata.project_id = '507f1f77bcf86cd799439011' OR f.metadata.project_id IS NULL)

ORDER BY 
  relevance_score DESC,
  f.download_count DESC,
  f.upload_date DESC

LIMIT 20 OFFSET 0;

-- File versioning management with comprehensive history tracking
WITH file_versions AS (
  SELECT 
    f.file_id,
    f.filename,
    f.content_type,
    f.file_size,
    f.upload_date,
    f.metadata,
    
    -- Version information
    f.metadata.version as version_number,
    f.metadata.parent_file_id,
    f.metadata.is_current_version,
    f.metadata.version_notes,
    
    -- Version relationships
    LAG(f.file_id) OVER (
      PARTITION BY COALESCE(f.metadata.parent_file_id, f.file_id)
      ORDER BY f.metadata.version
    ) as previous_version_id,
    
    LEAD(f.file_id) OVER (
      PARTITION BY COALESCE(f.metadata.parent_file_id, f.file_id)
      ORDER BY f.metadata.version  
    ) as next_version_id,
    
    -- Version statistics
    COUNT(*) OVER (
      PARTITION BY COALESCE(f.metadata.parent_file_id, f.file_id)
    ) as total_versions,
    
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(f.metadata.parent_file_id, f.file_id)
      ORDER BY f.metadata.version DESC
    ) as version_rank
    
  FROM files f
  WHERE f.metadata.version IS NOT NULL
),

version_changes AS (
  SELECT 
    fv.*,
    
    -- Size change analysis
    fv.file_size - LAG(fv.file_size) OVER (
      PARTITION BY COALESCE(fv.metadata.parent_file_id, fv.file_id)
      ORDER BY fv.version_number
    ) as size_change,
    
    -- Time between versions
    fv.upload_date - LAG(fv.upload_date) OVER (
      PARTITION BY COALESCE(fv.metadata.parent_file_id, fv.file_id)  
      ORDER BY fv.version_number
    ) as time_since_previous_version,
    
    -- Version change type
    CASE 
      WHEN LAG(fv.file_size) OVER (
        PARTITION BY COALESCE(fv.metadata.parent_file_id, fv.file_id)
        ORDER BY fv.version_number
      ) IS NULL THEN 'initial'
      WHEN fv.file_size > LAG(fv.file_size) OVER (
        PARTITION BY COALESCE(fv.metadata.parent_file_id, fv.file_id)
        ORDER BY fv.version_number
      ) THEN 'expansion'
      WHEN fv.file_size < LAG(fv.file_size) OVER (
        PARTITION BY COALESCE(fv.metadata.parent_file_id, fv.file_id)
        ORDER BY fv.version_number
      ) THEN 'reduction'
      ELSE 'maintenance'
    END as change_type
    
  FROM file_versions fv
)

SELECT 
  vc.file_id,
  vc.filename,
  vc.version_number,
  vc.upload_date,
  vc.file_size,
  vc.metadata.version_notes,
  vc.is_current_version,
  
  -- Version navigation
  vc.previous_version_id,
  vc.next_version_id,
  vc.total_versions,
  vc.version_rank,
  
  -- Change analysis
  vc.size_change,
  vc.time_since_previous_version,
  vc.change_type,
  
  -- Formatted information
  CASE 
    WHEN vc.size_change > 0 THEN CONCAT('+', vc.size_change, ' bytes')
    WHEN vc.size_change < 0 THEN CONCAT(vc.size_change, ' bytes')
    ELSE 'No size change'
  END as formatted_size_change,
  
  CASE 
    WHEN vc.time_since_previous_version IS NULL THEN 'Initial version'
    WHEN EXTRACT(DAYS FROM vc.time_since_previous_version) > 0 THEN 
      CONCAT(EXTRACT(DAYS FROM vc.time_since_previous_version), ' days ago')
    WHEN EXTRACT(HOURS FROM vc.time_since_previous_version) > 0 THEN 
      CONCAT(EXTRACT(HOURS FROM vc.time_since_previous_version), ' hours ago')
    ELSE 'Less than an hour ago'
  END as formatted_time_diff,
  
  -- Version actions
  CASE vc.is_current_version
    WHEN true THEN 'Current Version'
    ELSE 'Restore This Version'
  END as version_action,
  
  -- Download URLs for each version
  CONCAT('/api/files/', vc.file_id, '/download') as download_url,
  CONCAT('/api/files/', vc.file_id, '/compare/', vc.previous_version_id) as compare_url

FROM version_changes vc
WHERE COALESCE(vc.metadata.parent_file_id, vc.file_id) = '507f1f77bcf86cd799439015'
ORDER BY vc.version_number DESC;

-- Advanced file analytics and usage reporting
WITH file_analytics AS (
  SELECT 
    f.file_id,
    f.filename,
    f.content_type,
    f.file_size,
    f.upload_date,
    f.metadata,
    
    -- Usage statistics
    f.download_count,
    f.metadata.last_accessed,
    
    -- File age and activity metrics
    EXTRACT(DAYS FROM CURRENT_TIMESTAMP - f.upload_date) as age_days,
    EXTRACT(DAYS FROM CURRENT_TIMESTAMP - f.metadata.last_accessed) as days_since_access,
    
    -- Usage intensity calculation
    CASE 
      WHEN EXTRACT(DAYS FROM CURRENT_TIMESTAMP - f.upload_date) > 0 THEN
        f.download_count::float / EXTRACT(DAYS FROM CURRENT_TIMESTAMP - f.upload_date)
      ELSE f.download_count::float
    END as downloads_per_day,
    
    -- Storage cost calculation (simplified)
    f.file_size * 0.00000012 as monthly_storage_cost_usd, -- $0.12 per GB per month
    
    -- File category classification
    CASE 
      WHEN f.content_type LIKE 'image/%' THEN 'Images'
      WHEN f.content_type LIKE 'video/%' THEN 'Videos' 
      WHEN f.content_type LIKE 'audio/%' THEN 'Audio'
      WHEN f.content_type IN ('application/pdf', 'application/msword', 'text/plain') THEN 'Documents'
      WHEN f.content_type LIKE 'application/%zip%' OR f.content_type LIKE '%compress%' THEN 'Archives'
      ELSE 'Other'
    END as file_category,
    
    -- Size category
    CASE 
      WHEN f.file_size < 1024 * 1024 THEN 'Small (<1MB)'
      WHEN f.file_size < 10 * 1024 * 1024 THEN 'Medium (1-10MB)'
      WHEN f.file_size < 100 * 1024 * 1024 THEN 'Large (10-100MB)'
      ELSE 'Very Large (>100MB)'
    END as size_category,
    
    -- Activity classification
    CASE 
      WHEN f.metadata.last_accessed > CURRENT_DATE - INTERVAL '7 days' THEN 'Hot'
      WHEN f.metadata.last_accessed > CURRENT_DATE - INTERVAL '30 days' THEN 'Warm'  
      WHEN f.metadata.last_accessed > CURRENT_DATE - INTERVAL '90 days' THEN 'Cool'
      ELSE 'Cold'
    END as access_temperature
    
  FROM files f
  WHERE f.upload_date >= CURRENT_DATE - INTERVAL '1 year'
),

aggregated_analytics AS (
  SELECT 
    -- Overall file statistics
    COUNT(*) as total_files,
    SUM(fa.file_size) as total_storage_bytes,
    AVG(fa.file_size) as avg_file_size,
    SUM(fa.download_count) as total_downloads,
    AVG(fa.download_count) as avg_downloads_per_file,
    SUM(fa.monthly_storage_cost_usd) as total_monthly_cost_usd,
    
    -- Category breakdown
    COUNT(*) FILTER (WHERE fa.file_category = 'Images') as image_count,
    COUNT(*) FILTER (WHERE fa.file_category = 'Documents') as document_count,
    COUNT(*) FILTER (WHERE fa.file_category = 'Videos') as video_count,
    COUNT(*) FILTER (WHERE fa.file_category = 'Archives') as archive_count,
    
    -- Size distribution
    COUNT(*) FILTER (WHERE fa.size_category = 'Small (<1MB)') as small_files,
    COUNT(*) FILTER (WHERE fa.size_category = 'Medium (1-10MB)') as medium_files,
    COUNT(*) FILTER (WHERE fa.size_category = 'Large (10-100MB)') as large_files,
    COUNT(*) FILTER (WHERE fa.size_category = 'Very Large (>100MB)') as very_large_files,
    
    -- Activity distribution
    COUNT(*) FILTER (WHERE fa.access_temperature = 'Hot') as hot_files,
    COUNT(*) FILTER (WHERE fa.access_temperature = 'Warm') as warm_files,
    COUNT(*) FILTER (WHERE fa.access_temperature = 'Cool') as cool_files,
    COUNT(*) FILTER (WHERE fa.access_temperature = 'Cold') as cold_files,
    
    -- Storage optimization opportunities
    SUM(fa.file_size) FILTER (WHERE fa.access_temperature = 'Cold') as cold_storage_bytes,
    COUNT(*) FILTER (WHERE fa.download_count = 0 AND fa.age_days > 90) as unused_files,
    
    -- Performance metrics
    AVG(fa.downloads_per_day) as avg_downloads_per_day,
    MAX(fa.downloads_per_day) as max_downloads_per_day,
    
    -- Trend analysis
    COUNT(*) FILTER (WHERE fa.upload_date >= CURRENT_DATE - INTERVAL '30 days') as files_last_30_days,
    COUNT(*) FILTER (WHERE fa.upload_date >= CURRENT_DATE - INTERVAL '7 days') as files_last_7_days
    
  FROM file_analytics fa
)

SELECT 
  -- Storage summary
  total_files,
  ROUND((total_storage_bytes / 1024.0 / 1024 / 1024)::numeric, 2) as total_storage_gb,
  ROUND((avg_file_size / 1024.0 / 1024)::numeric, 2) as avg_file_size_mb,
  ROUND(total_monthly_cost_usd::numeric, 2) as monthly_cost_usd,
  
  -- Usage summary
  total_downloads,
  ROUND(avg_downloads_per_file::numeric, 1) as avg_downloads_per_file,
  ROUND(avg_downloads_per_day::numeric, 2) as avg_downloads_per_day,
  
  -- Category distribution (percentages)
  ROUND((image_count::float / total_files * 100)::numeric, 1) as image_percentage,
  ROUND((document_count::float / total_files * 100)::numeric, 1) as document_percentage,
  ROUND((video_count::float / total_files * 100)::numeric, 1) as video_percentage,
  
  -- Size distribution (percentages)
  ROUND((small_files::float / total_files * 100)::numeric, 1) as small_files_percentage,
  ROUND((medium_files::float / total_files * 100)::numeric, 1) as medium_files_percentage,
  ROUND((large_files::float / total_files * 100)::numeric, 1) as large_files_percentage,
  ROUND((very_large_files::float / total_files * 100)::numeric, 1) as very_large_files_percentage,
  
  -- Activity distribution
  hot_files,
  warm_files, 
  cool_files,
  cold_files,
  
  -- Optimization opportunities
  ROUND((cold_storage_bytes / 1024.0 / 1024 / 1024)::numeric, 2) as cold_storage_gb,
  unused_files,
  ROUND((unused_files::float / total_files * 100)::numeric, 1) as unused_files_percentage,
  
  -- Growth trends
  files_last_30_days,
  files_last_7_days,
  ROUND(((files_last_30_days::float / GREATEST(total_files - files_last_30_days, 1)) * 100)::numeric, 1) as monthly_growth_rate,
  
  -- Recommendations
  CASE 
    WHEN unused_files::float / total_files > 0.2 THEN 'High cleanup potential - consider archiving unused files'
    WHEN cold_storage_bytes::float / total_storage_bytes > 0.5 THEN 'Cold storage optimization recommended'
    WHEN files_last_7_days::float / files_last_30_days > 0.5 THEN 'High recent activity - monitor storage growth'
    ELSE 'File storage appears optimized'
  END as optimization_recommendation

FROM aggregated_analytics;

-- File cleanup and maintenance operations
DELETE FROM files 
WHERE 
  -- Remove temporary files older than 24 hours
  (metadata.category = 'temporary' AND upload_date < CURRENT_TIMESTAMP - INTERVAL '24 hours')
  
  OR 
  
  -- Remove unused files older than 1 year with no downloads
  (download_count = 0 AND upload_date < CURRENT_TIMESTAMP - INTERVAL '1 year')
  
  OR
  
  -- Remove orphaned file versions (parent file no longer exists)
  (metadata.parent_file_id IS NOT NULL AND 
   metadata.parent_file_id NOT IN (SELECT file_id FROM files WHERE metadata.is_current_version = true));

-- QueryLeaf provides comprehensive GridFS capabilities:
-- 1. SQL-familiar syntax for MongoDB GridFS file storage and management  
-- 2. Advanced file upload with comprehensive metadata and processing options
-- 3. Sophisticated file search with relevance scoring and multi-field filtering
-- 4. Complete file versioning system with history tracking and comparison
-- 5. Real-time file analytics and usage reporting with optimization recommendations
-- 6. Automated file lifecycle management and cleanup operations
-- 7. Integration with MongoDB's native GridFS chunking and streaming capabilities
-- 8. Advanced access control and permission management for file security
-- 9. Performance optimization through intelligent caching and storage distribution
-- 10. Production-ready file management with monitoring, alerts, and maintenance automation
```

## Best Practices for Production GridFS Implementation

### File Storage Strategy

Essential principles for effective MongoDB GridFS deployment and management:

1. **Bucket Organization**: Design appropriate GridFS buckets for different file types and use cases to optimize performance
2. **Chunk Size Optimization**: Configure optimal chunk sizes based on file types and access patterns for storage efficiency
3. **Metadata Design**: Implement comprehensive metadata schemas for search, categorization, and lifecycle management
4. **Access Control Integration**: Design robust permission systems that integrate with application authentication and authorization
5. **Performance Monitoring**: Implement comprehensive monitoring for file access patterns, storage growth, and system performance
6. **Backup and Recovery**: Design complete backup strategies that ensure file integrity and availability

### Scalability and Performance Optimization

Optimize GridFS deployments for production-scale requirements:

1. **Sharding Strategy**: Design appropriate sharding keys for distributed file storage across MongoDB clusters  
2. **Index Optimization**: Create optimal indexes for file metadata queries and search operations
3. **Caching Implementation**: Implement multi-tier caching strategies for frequently accessed files
4. **Content Delivery**: Integrate with CDN services for optimal file delivery performance
5. **Storage Optimization**: Implement automated archival, compression, and deduplication strategies
6. **Resource Management**: Monitor and optimize storage utilization, network bandwidth, and processing resources

## Conclusion

MongoDB GridFS provides a comprehensive solution for storing and managing large files within MongoDB applications, offering seamless integration between file storage and document data while supporting advanced features like streaming, versioning, metadata management, and scalable storage patterns. The native MongoDB integration ensures that file storage benefits from the same replication, sharding, and backup capabilities as application data.

Key MongoDB GridFS benefits include:

- **Seamless Integration**: Native MongoDB integration with automatic replication, sharding, and backup capabilities
- **Advanced File Management**: Comprehensive versioning, metadata extraction, thumbnail generation, and processing pipelines  
- **Scalable Architecture**: Automatic file chunking and streaming support for files of any size
- **Sophisticated Search**: Rich metadata-based search with relevance scoring and advanced filtering capabilities
- **Production Features**: Built-in access control, lifecycle management, monitoring, and optimization capabilities
- **SQL Compatibility**: Familiar SQL-style file operations through QueryLeaf integration for accessible file management

Whether you're building document management systems, media applications, content platforms, or any application requiring sophisticated file storage, MongoDB GridFS with QueryLeaf's familiar SQL interface provides the foundation for robust, scalable file management.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB GridFS operations while providing SQL-familiar syntax for file upload, download, search, and management. Advanced GridFS patterns, metadata management, and file processing capabilities are seamlessly handled through familiar SQL constructs, making sophisticated file storage both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust GridFS capabilities with SQL-style file operations makes it an ideal platform for applications requiring both advanced file storage and familiar database management patterns, ensuring your file storage solutions can scale efficiently while remaining maintainable and feature-rich as they evolve.