---
title: "MongoDB GridFS and File Storage: SQL-Style Binary Data Management with Metadata Integration"
description: "Master MongoDB GridFS for large file storage, binary data management, and media handling. Learn file streaming, metadata integration, and SQL-familiar file operations for scalable document storage systems."
date: 2025-09-11
tags: [mongodb, gridfs, file-storage, binary-data, media-management, sql, document-storage]
---

# MongoDB GridFS and File Storage: SQL-Style Binary Data Management with Metadata Integration

Modern applications increasingly handle diverse file types - documents, images, videos, audio files, backups, and large datasets. Traditional relational databases struggle with binary data storage, often requiring external file systems, complex blob handling, or separate storage services that create synchronization challenges and architectural complexity.

MongoDB GridFS provides native large file storage capabilities directly within your database, enabling seamless binary data management with integrated metadata, automatic chunking for large files, and powerful querying capabilities. Unlike external file storage solutions, GridFS maintains transactional consistency, provides built-in replication, and integrates file operations with your existing database queries.

## The File Storage Challenge

Traditional approaches to file storage have significant limitations:

```sql
-- Traditional SQL file storage approaches - complex and fragmented

-- Option 1: Store file paths only (external file system)
CREATE TABLE documents (
    document_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,    -- Path to external file
    file_size BIGINT,
    mime_type VARCHAR(100),
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by INTEGER REFERENCES users(user_id)
);

-- Insert file reference
INSERT INTO documents (title, file_path, file_size, mime_type, uploaded_by)
VALUES ('Annual Report 2024', '/files/2024/annual-report.pdf', 2048576, 'application/pdf', 123);

-- Problems with external file storage:
-- - File system and database can become out of sync
-- - No transactional consistency between file and metadata
-- - Complex backup and replication strategies
-- - Permission and security management split between systems
-- - No atomic operations across file and metadata
-- - Difficult to query file content and metadata together

-- Option 2: Store files as BLOBs (limited and inefficient)
CREATE TABLE file_storage (
    file_id SERIAL PRIMARY KEY,
    filename VARCHAR(255),
    file_data BYTEA,           -- Binary data (PostgreSQL)
    -- file_data LONGBLOB,     -- Binary data (MySQL)
    file_size INTEGER,
    mime_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert binary data
INSERT INTO file_storage (filename, file_data, file_size, mime_type)
VALUES ('document.pdf', pg_read_binary_file('/tmp/document.pdf'), 1048576, 'application/pdf');

-- Problems with BLOB storage:
-- - Size limitations (often 16MB-4GB depending on database)
-- - Memory issues when loading large files
-- - Poor performance for streaming large files
-- - Limited metadata and search capabilities
-- - Difficult to handle partial file operations
-- - Database backup sizes become unmanageable
-- - No built-in file chunking or streaming support
```

MongoDB GridFS solves these challenges comprehensively:

```javascript
// MongoDB GridFS - native large file storage with integrated metadata
const { GridFSBucket, MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('document_management');

// Create GridFS bucket for file operations
const bucket = new GridFSBucket(db, { 
  bucketName: 'documents',
  chunkSizeBytes: 1024 * 1024  // 1MB chunks for optimal performance
});

// Store file with rich metadata - no size limits
const uploadStream = bucket.openUploadStream('annual-report-2024.pdf', {
  metadata: {
    title: 'Annual Report 2024',
    description: 'Company annual financial report for 2024',
    category: 'financial-reports',
    department: 'finance',
    confidentialityLevel: 'internal',
    uploadedBy: ObjectId('64f1a2c4567890abcdef1234'),
    uploadedByName: 'John Smith',
    tags: ['annual', 'report', '2024', 'finance', 'quarterly'],
    approvalStatus: 'pending',
    version: '1.0',
    relatedDocuments: [
      ObjectId('64f1a2c4567890abcdef5678'),
      ObjectId('64f1a2c4567890abcdef9abc')
    ],
    accessPermissions: {
      read: ['finance', 'management', 'audit'],
      write: ['finance'],
      admin: ['finance-manager']
    }
  }
});

// Stream file data efficiently (handles files of any size)
const fs = require('fs');
fs.createReadStream('./annual-report-2024.pdf')
  .pipe(uploadStream)
  .on('error', (error) => {
    console.error('File upload failed:', error);
  })
  .on('finish', () => {
    console.log('File uploaded successfully:', uploadStream.id);
  });

// Benefits of GridFS:
// - No file size limitations (handles multi-GB files efficiently)
// - Automatic chunking and streaming for optimal memory usage
// - Rich metadata storage with full query capabilities
// - Transactional consistency between file data and metadata
// - Built-in replication and backup with your database
// - Powerful file search and filtering capabilities
// - Atomic file operations with metadata updates
// - Integration with MongoDB aggregation pipeline
```

## Understanding MongoDB GridFS

### GridFS Architecture and File Operations

Implement comprehensive file management systems:

```javascript
// Advanced GridFS file management system
class GridFSFileManager {
  constructor(db, bucketName = 'files') {
    this.db = db;
    this.bucketName = bucketName;
    this.bucket = new GridFSBucket(db, {
      bucketName: bucketName,
      chunkSizeBytes: 1024 * 1024 // 1MB chunks
    });
    
    // Collections automatically created by GridFS
    this.filesCollection = db.collection(`${bucketName}.files`);
    this.chunksCollection = db.collection(`${bucketName}.chunks`);
  }

  async uploadFile(filePath, filename, metadata = {}) {
    // Upload file with comprehensive metadata
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const uploadStream = this.bucket.openUploadStream(filename, {
        metadata: {
          ...metadata,
          uploadDate: new Date(),
          originalPath: filePath,
          fileStats: fs.statSync(filePath),
          checksum: this.calculateChecksum(filePath),
          contentAnalysis: this.analyzeFileContent(filePath, metadata.mimeType)
        }
      });

      fs.createReadStream(filePath)
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => {
          resolve({
            fileId: uploadStream.id,
            filename: filename,
            uploadDate: new Date(),
            metadata: metadata
          });
        });
    });
  }

  async uploadFromBuffer(buffer, filename, metadata = {}) {
    // Upload file from memory buffer
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket.openUploadStream(filename, {
        metadata: {
          ...metadata,
          uploadDate: new Date(),
          bufferSize: buffer.length,
          source: 'buffer'
        }
      });

      const { Readable } = require('stream');
      const bufferStream = new Readable();
      bufferStream.push(buffer);
      bufferStream.push(null);

      bufferStream
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => {
          resolve({
            fileId: uploadStream.id,
            filename: filename,
            size: buffer.length
          });
        });
    });
  }

  async downloadFile(fileId, outputPath) {
    // Download file to local filesystem
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const downloadStream = this.bucket.openDownloadStream(ObjectId(fileId));
      const writeStream = fs.createWriteStream(outputPath);

      downloadStream
        .pipe(writeStream)
        .on('error', reject)
        .on('finish', () => {
          resolve({
            fileId: fileId,
            downloadPath: outputPath,
            downloadDate: new Date()
          });
        });

      downloadStream.on('error', reject);
    });
  }

  async getFileBuffer(fileId) {
    // Get file as buffer for in-memory processing
    return new Promise((resolve, reject) => {
      const downloadStream = this.bucket.openDownloadStream(ObjectId(fileId));
      const chunks = [];

      downloadStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      downloadStream.on('error', reject);

      downloadStream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });
    });
  }

  async streamFileToResponse(fileId, response) {
    // Stream file directly to HTTP response (efficient for web serving)
    const file = await this.getFileMetadata(fileId);
    
    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    // Set appropriate headers
    response.set({
      'Content-Type': file.metadata?.mimeType || 'application/octet-stream',
      'Content-Length': file.length,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Cache-Control': 'public, max-age=3600',
      'ETag': `"${file.md5}"`
    });

    const downloadStream = this.bucket.openDownloadStream(ObjectId(fileId));
    
    return new Promise((resolve, reject) => {
      downloadStream
        .pipe(response)
        .on('error', reject)
        .on('finish', resolve);
      
      downloadStream.on('error', reject);
    });
  }

  async getFileMetadata(fileId) {
    // Get comprehensive file metadata
    const file = await this.filesCollection.findOne({ 
      _id: ObjectId(fileId) 
    });

    if (!file) {
      return null;
    }

    return {
      fileId: file._id,
      filename: file.filename,
      length: file.length,
      chunkSize: file.chunkSize,
      uploadDate: file.uploadDate,
      md5: file.md5,
      metadata: file.metadata || {},
      
      // Additional computed properties
      humanSize: this.formatFileSize(file.length),
      mimeType: file.metadata?.mimeType,
      category: file.metadata?.category,
      tags: file.metadata?.tags || [],
      
      // File analysis
      chunkCount: Math.ceil(file.length / file.chunkSize),
      isComplete: await this.verifyFileIntegrity(fileId)
    };
  }

  async searchFiles(searchCriteria) {
    // Advanced file search with metadata querying
    const query = {};

    // Filename search
    if (searchCriteria.filename) {
      query.filename = new RegExp(searchCriteria.filename, 'i');
    }

    // Metadata searches
    if (searchCriteria.category) {
      query['metadata.category'] = searchCriteria.category;
    }

    if (searchCriteria.tags) {
      query['metadata.tags'] = { $in: searchCriteria.tags };
    }

    if (searchCriteria.mimeType) {
      query['metadata.mimeType'] = searchCriteria.mimeType;
    }

    if (searchCriteria.uploadedBy) {
      query['metadata.uploadedBy'] = ObjectId(searchCriteria.uploadedBy);
    }

    // Date range search
    if (searchCriteria.dateRange) {
      query.uploadDate = {
        $gte: new Date(searchCriteria.dateRange.start),
        $lte: new Date(searchCriteria.dateRange.end)
      };
    }

    // Size range search
    if (searchCriteria.sizeRange) {
      query.length = {
        $gte: searchCriteria.sizeRange.min || 0,
        $lte: searchCriteria.sizeRange.max || Number.MAX_SAFE_INTEGER
      };
    }

    const files = await this.filesCollection
      .find(query)
      .sort({ uploadDate: -1 })
      .limit(searchCriteria.limit || 50)
      .toArray();

    return files.map(file => ({
      fileId: file._id,
      filename: file.filename,
      size: file.length,
      humanSize: this.formatFileSize(file.length),
      uploadDate: file.uploadDate,
      metadata: file.metadata || {},
      md5: file.md5
    }));
  }

  async updateFileMetadata(fileId, metadataUpdate) {
    // Update file metadata without modifying file content
    const result = await this.filesCollection.updateOne(
      { _id: ObjectId(fileId) },
      { 
        $set: {
          'metadata.lastModified': new Date(),
          ...Object.keys(metadataUpdate).reduce((acc, key) => {
            acc[`metadata.${key}`] = metadataUpdate[key];
            return acc;
          }, {})
        }
      }
    );

    if (result.modifiedCount === 0) {
      throw new Error(`File ${fileId} not found or metadata unchanged`);
    }

    return await this.getFileMetadata(fileId);
  }

  async deleteFile(fileId) {
    // Delete file and all its chunks
    try {
      await this.bucket.delete(ObjectId(fileId));
      
      // Log deletion for audit
      await this.db.collection('file_audit_log').insertOne({
        operation: 'delete',
        fileId: ObjectId(fileId),
        deletedAt: new Date(),
        deletedBy: 'system' // Could be passed as parameter
      });

      return { 
        success: true, 
        fileId: fileId,
        deletedAt: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to delete file ${fileId}: ${error.message}`);
    }
  }

  async duplicateFile(fileId, newFilename, metadataChanges = {}) {
    // Create a duplicate of an existing file
    const originalFile = await this.getFileMetadata(fileId);
    if (!originalFile) {
      throw new Error(`Original file ${fileId} not found`);
    }

    const buffer = await this.getFileBuffer(fileId);
    
    const newMetadata = {
      ...originalFile.metadata,
      ...metadataChanges,
      originalFileId: ObjectId(fileId),
      duplicatedAt: new Date(),
      duplicatedFrom: originalFile.filename
    };

    return await this.uploadFromBuffer(buffer, newFilename, newMetadata);
  }

  async getFilesByCategory(category, options = {}) {
    // Get files by category with optional sorting and pagination
    const query = { 'metadata.category': category };
    
    let cursor = this.filesCollection.find(query);

    if (options.sortBy) {
      const sortField = options.sortBy === 'size' ? 'length' : 
                       options.sortBy === 'date' ? 'uploadDate' : 
                       options.sortBy;
      cursor = cursor.sort({ [sortField]: options.sortOrder === 'asc' ? 1 : -1 });
    }

    if (options.skip) cursor = cursor.skip(options.skip);
    if (options.limit) cursor = cursor.limit(options.limit);

    const files = await cursor.toArray();
    
    return {
      category: category,
      files: files.map(file => ({
        fileId: file._id,
        filename: file.filename,
        size: file.length,
        humanSize: this.formatFileSize(file.length),
        uploadDate: file.uploadDate,
        metadata: file.metadata
      })),
      totalCount: await this.filesCollection.countDocuments(query)
    };
  }

  async getStorageStatistics() {
    // Get comprehensive storage statistics
    const stats = await this.filesCollection.aggregate([
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: '$length' },
          avgFileSize: { $avg: '$length' },
          oldestFile: { $min: '$uploadDate' },
          newestFile: { $max: '$uploadDate' }
        }
      }
    ]).toArray();

    const categoryStats = await this.filesCollection.aggregate([
      {
        $group: {
          _id: '$metadata.category',
          count: { $sum: 1 },
          totalSize: { $sum: '$length' },
          avgSize: { $avg: '$length' }
        }
      },
      { $sort: { totalSize: -1 } }
    ]).toArray();

    const mimeTypeStats = await this.filesCollection.aggregate([
      {
        $group: {
          _id: '$metadata.mimeType',
          count: { $sum: 1 },
          totalSize: { $sum: '$length' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    const chunkStats = await this.chunksCollection.aggregate([
      {
        $group: {
          _id: null,
          totalChunks: { $sum: 1 },
          avgChunkSize: { $avg: { $binarySize: '$data' } }
        }
      }
    ]).toArray();

    return {
      overview: stats[0] || {
        totalFiles: 0,
        totalSize: 0,
        avgFileSize: 0
      },
      byCategory: categoryStats,
      byMimeType: mimeTypeStats.slice(0, 10), // Top 10 mime types
      chunkStatistics: chunkStats[0] || {},
      humanReadable: {
        totalSize: this.formatFileSize(stats[0]?.totalSize || 0),
        avgFileSize: this.formatFileSize(stats[0]?.avgFileSize || 0)
      }
    };
  }

  async verifyFileIntegrity(fileId) {
    // Verify file integrity by checking chunks
    const file = await this.filesCollection.findOne({ _id: ObjectId(fileId) });
    if (!file) return false;

    const expectedChunks = Math.ceil(file.length / file.chunkSize);
    const actualChunks = await this.chunksCollection.countDocuments({
      files_id: ObjectId(fileId)
    });

    return expectedChunks === actualChunks;
  }

  formatFileSize(bytes) {
    // Human-readable file size formatting
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const base = 1024;
    const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
    const size = bytes / Math.pow(base, unitIndex);
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  calculateChecksum(filePath) {
    // Calculate MD5 checksum for file integrity
    const crypto = require('crypto');
    const fs = require('fs');
    const hash = crypto.createHash('md5');
    const data = fs.readFileSync(filePath);
    return hash.update(data).digest('hex');
  }

  analyzeFileContent(filePath, mimeType) {
    // Basic file content analysis
    const fs = require('fs');
    const stats = fs.statSync(filePath);
    
    const analysis = {
      isExecutable: stats.mode & parseInt('111', 8),
      lastModified: stats.mtime,
      createdAt: stats.birthtime,
      fileType: this.getFileTypeFromMime(mimeType)
    };

    // Additional analysis based on file type
    if (mimeType && mimeType.startsWith('image/')) {
      analysis.category = 'image';
      // Could add image dimension analysis here
    } else if (mimeType && mimeType.startsWith('video/')) {
      analysis.category = 'video';
      // Could add video metadata extraction here
    } else if (mimeType && mimeType.includes('pdf')) {
      analysis.category = 'document';
      // Could add PDF metadata extraction here
    }

    return analysis;
  }

  getFileTypeFromMime(mimeType) {
    if (!mimeType) return 'unknown';
    
    const typeMap = {
      'application/pdf': 'pdf',
      'application/msword': 'word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
      'application/vnd.ms-excel': 'excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
      'text/plain': 'text',
      'text/csv': 'csv',
      'application/json': 'json',
      'application/zip': 'archive',
      'application/x-tar': 'archive'
    };

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    
    return typeMap[mimeType] || 'other';
  }
}
```

### Advanced File Processing and Streaming

Implement sophisticated file processing capabilities:

```javascript
// Advanced file processing and streaming operations
class GridFSProcessingService {
  constructor(db, fileManager) {
    this.db = db;
    this.fileManager = fileManager;
    this.processingQueue = db.collection('file_processing_queue');
  }

  async processImageFile(fileId, operations) {
    // Process image files with transformations
    const Sharp = require('sharp'); // Image processing library
    const originalBuffer = await this.fileManager.getFileBuffer(fileId);
    const originalMeta = await this.fileManager.getFileMetadata(fileId);

    const processedVersions = [];

    for (const operation of operations) {
      let processedBuffer;
      let newFilename;
      
      switch (operation.type) {
        case 'resize':
          processedBuffer = await Sharp(originalBuffer)
            .resize(operation.width, operation.height, {
              fit: operation.fit || 'cover',
              withoutEnlargement: true
            })
            .toBuffer();
          newFilename = `${originalMeta.filename}_${operation.width}x${operation.height}`;
          break;

        case 'thumbnail':
          processedBuffer = await Sharp(originalBuffer)
            .resize(150, 150, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toBuffer();
          newFilename = `${originalMeta.filename}_thumbnail`;
          break;

        case 'watermark':
          const watermark = await Sharp(operation.watermarkPath)
            .resize(Math.floor(operation.width * 0.3))
            .png()
            .toBuffer();
          
          processedBuffer = await Sharp(originalBuffer)
            .composite([{
              input: watermark,
              gravity: operation.position || 'southeast'
            }])
            .toBuffer();
          newFilename = `${originalMeta.filename}_watermarked`;
          break;

        case 'format_conversion':
          const sharpInstance = Sharp(originalBuffer);
          
          switch (operation.format) {
            case 'jpeg':
              processedBuffer = await sharpInstance.jpeg({ quality: operation.quality || 85 }).toBuffer();
              break;
            case 'png':
              processedBuffer = await sharpInstance.png({ compressionLevel: operation.compression || 6 }).toBuffer();
              break;
            case 'webp':
              processedBuffer = await sharpInstance.webp({ quality: operation.quality || 80 }).toBuffer();
              break;
          }
          newFilename = `${originalMeta.filename}.${operation.format}`;
          break;
      }

      // Upload processed version
      const processedFile = await this.fileManager.uploadFromBuffer(
        processedBuffer,
        newFilename,
        {
          ...originalMeta.metadata,
          processedFrom: originalMeta.fileId,
          processingOperation: operation,
          processedAt: new Date(),
          category: 'processed-image',
          originalFileId: originalMeta.fileId
        }
      );

      processedVersions.push(processedFile);
    }

    // Update original file metadata with processing info
    await this.fileManager.updateFileMetadata(fileId, {
      processedVersions: processedVersions.map(v => v.fileId),
      processingComplete: true,
      processedAt: new Date()
    });

    return processedVersions;
  }

  async extractDocumentText(fileId) {
    // Extract text content from documents for search indexing
    const fileBuffer = await this.fileManager.getFileBuffer(fileId);
    const metadata = await this.fileManager.getFileMetadata(fileId);
    const mimeType = metadata.metadata?.mimeType;

    let extractedText = '';

    try {
      switch (mimeType) {
        case 'application/pdf':
          // PDF text extraction
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(fileBuffer);
          extractedText = pdfData.text;
          break;

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          // Word document text extraction
          const mammoth = require('mammoth');
          const wordResult = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText = wordResult.value;
          break;

        case 'text/plain':
        case 'text/csv':
        case 'application/json':
          // Plain text files
          extractedText = fileBuffer.toString('utf8');
          break;

        default:
          console.log(`Text extraction not supported for ${mimeType}`);
          return null;
      }

      // Store extracted text for search
      await this.fileManager.updateFileMetadata(fileId, {
        extractedText: extractedText.substring(0, 10000), // Limit stored text
        textExtracted: true,
        textExtractionDate: new Date(),
        wordCount: extractedText.split(/\s+/).length,
        characterCount: extractedText.length
      });

      // Create text search index entry
      await this.db.collection('file_text_index').insertOne({
        fileId: ObjectId(fileId),
        filename: metadata.filename,
        extractedText: extractedText,
        extractedAt: new Date(),
        metadata: metadata.metadata
      });

      return {
        fileId: fileId,
        extractedText: extractedText,
        wordCount: extractedText.split(/\s+/).length,
        characterCount: extractedText.length
      };

    } catch (error) {
      console.error(`Text extraction failed for ${fileId}:`, error);
      
      await this.fileManager.updateFileMetadata(fileId, {
        textExtractionFailed: true,
        textExtractionError: error.message,
        textExtractionAttempted: new Date()
      });

      return null;
    }
  }

  async createFileArchive(fileIds, archiveName) {
    // Create ZIP archive containing multiple files
    const archiver = require('archiver');
    const { PassThrough } = require('stream');

    const archive = archiver('zip', { zlib: { level: 9 } });
    const bufferStream = new PassThrough();
    const chunks = [];

    bufferStream.on('data', (chunk) => chunks.push(chunk));
    
    return new Promise(async (resolve, reject) => {
      bufferStream.on('end', async () => {
        const archiveBuffer = Buffer.concat(chunks);
        
        // Upload archive to GridFS
        const archiveFile = await this.fileManager.uploadFromBuffer(
          archiveBuffer,
          `${archiveName}.zip`,
          {
            category: 'archive',
            archiveType: 'zip',
            containedFiles: fileIds,
            createdAt: new Date(),
            fileCount: fileIds.length,
            mimeType: 'application/zip'
          }
        );

        resolve(archiveFile);
      });

      archive.on('error', reject);
      archive.pipe(bufferStream);

      // Add files to archive
      for (const fileId of fileIds) {
        const metadata = await this.fileManager.getFileMetadata(fileId);
        const fileBuffer = await this.fileManager.getFileBuffer(fileId);
        
        archive.append(fileBuffer, { name: metadata.filename });
      }

      archive.finalize();
    });
  }

  async streamFileRange(fileId, range) {
    // Stream partial file content (useful for video streaming, resume downloads)
    const file = await this.fileManager.getFileMetadata(fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    const { start = 0, end = file.length - 1 } = range;
    const chunkSize = file.chunkSize;
    
    const startChunk = Math.floor(start / chunkSize);
    const endChunk = Math.floor(end / chunkSize);
    
    // Get relevant chunks
    const chunks = await this.fileManager.chunksCollection
      .find({
        files_id: ObjectId(fileId),
        n: { $gte: startChunk, $lte: endChunk }
      })
      .sort({ n: 1 })
      .toArray();

    const { Readable } = require('stream');
    const rangeStream = new Readable({
      read() {}
    });

    // Process chunks and extract requested range
    let currentPosition = startChunk * chunkSize;
    
    chunks.forEach((chunk, index) => {
      const chunkData = chunk.data.buffer;
      
      let chunkStart = 0;
      let chunkEnd = chunkData.length;
      
      // Adjust for first chunk
      if (index === 0 && start > currentPosition) {
        chunkStart = start - currentPosition;
      }
      
      // Adjust for last chunk
      if (index === chunks.length - 1 && end < currentPosition + chunkData.length) {
        chunkEnd = end - currentPosition + 1;
      }
      
      if (chunkStart < chunkEnd) {
        rangeStream.push(chunkData.slice(chunkStart, chunkEnd));
      }
      
      currentPosition += chunkData.length;
    });

    rangeStream.push(null); // End stream
    
    return {
      stream: rangeStream,
      contentLength: end - start + 1,
      contentRange: `bytes ${start}-${end}/${file.length}`
    };
  }

  async scheduleFileProcessing(fileId, processingType, options = {}) {
    // Queue file for background processing
    const processingJob = {
      fileId: ObjectId(fileId),
      processingType: processingType,
      options: options,
      status: 'queued',
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3
    };

    await this.processingQueue.insertOne(processingJob);
    
    // Trigger immediate processing if requested
    if (options.immediate) {
      return await this.processQueuedJob(processingJob._id);
    }

    return processingJob;
  }

  async processQueuedJob(jobId) {
    // Process queued file processing job
    const job = await this.processingQueue.findOne({ _id: ObjectId(jobId) });
    if (!job) {
      throw new Error(`Processing job ${jobId} not found`);
    }

    try {
      // Update job status
      await this.processingQueue.updateOne(
        { _id: job._id },
        { 
          $set: { 
            status: 'processing', 
            startedAt: new Date() 
          },
          $inc: { attempts: 1 }
        }
      );

      let result;

      switch (job.processingType) {
        case 'image_processing':
          result = await this.processImageFile(job.fileId, job.options.operations);
          break;
          
        case 'text_extraction':
          result = await this.extractDocumentText(job.fileId);
          break;
          
        case 'thumbnail_generation':
          result = await this.generateThumbnail(job.fileId, job.options);
          break;
          
        default:
          throw new Error(`Unknown processing type: ${job.processingType}`);
      }

      // Mark job as completed
      await this.processingQueue.updateOne(
        { _id: job._id },
        { 
          $set: { 
            status: 'completed',
            completedAt: new Date(),
            result: result
          }
        }
      );

      return result;

    } catch (error) {
      // Handle job failure
      const shouldRetry = job.attempts < job.maxAttempts;
      
      await this.processingQueue.updateOne(
        { _id: job._id },
        {
          $set: {
            status: shouldRetry ? 'failed_retryable' : 'failed',
            lastError: error.message,
            lastAttemptAt: new Date()
          }
        }
      );

      if (!shouldRetry) {
        console.error(`Processing job ${jobId} failed permanently:`, error);
      }

      throw error;
    }
  }

  async generateThumbnail(fileId, options = {}) {
    // Generate thumbnail for various file types
    const metadata = await this.fileManager.getFileMetadata(fileId);
    const mimeType = metadata.metadata?.mimeType;
    const { width = 150, height = 150, quality = 80 } = options;

    if (mimeType && mimeType.startsWith('image/')) {
      // Image thumbnail
      return await this.processImageFile(fileId, [{
        type: 'thumbnail',
        width: width,
        height: height,
        quality: quality
      }]);
    } else if (mimeType === 'application/pdf') {
      // PDF thumbnail (first page)
      const pdf2pic = require('pdf2pic');
      const fileBuffer = await this.fileManager.getFileBuffer(fileId);
      
      const convert = pdf2pic.fromBuffer(fileBuffer, {
        density: 100,
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: width,
        height: height
      });

      const result = await convert(1); // First page
      const thumbnailBuffer = require('fs').readFileSync(result.path);
      
      return await this.fileManager.uploadFromBuffer(
        thumbnailBuffer,
        `${metadata.filename}_thumbnail.png`,
        {
          category: 'thumbnail',
          thumbnailOf: fileId,
          generatedAt: new Date(),
          mimeType: 'image/png'
        }
      );
    }

    throw new Error(`Thumbnail generation not supported for ${mimeType}`);
  }
}
```

### File Security and Access Control

Implement comprehensive file security:

```javascript
// File security and access control system
class GridFSSecurityManager {
  constructor(db, fileManager) {
    this.db = db;
    this.fileManager = fileManager;
    this.accessLog = db.collection('file_access_log');
    this.permissions = db.collection('file_permissions');
  }

  async setFilePermissions(fileId, permissions) {
    // Set granular file permissions
    const permissionDoc = {
      fileId: ObjectId(fileId),
      permissions: {
        read: permissions.read || [],      // User/role IDs who can read
        write: permissions.write || [],    // User/role IDs who can modify
        delete: permissions.delete || [], // User/role IDs who can delete
        admin: permissions.admin || []     // User/role IDs who can change permissions
      },
      inheritance: permissions.inheritance || 'none', // none, folder, parent
      publicAccess: permissions.publicAccess || false,
      expiresAt: permissions.expiresAt || null,
      createdAt: new Date(),
      createdBy: permissions.createdBy
    };

    await this.permissions.replaceOne(
      { fileId: ObjectId(fileId) },
      permissionDoc,
      { upsert: true }
    );

    // Update file metadata
    await this.fileManager.updateFileMetadata(fileId, {
      hasCustomPermissions: true,
      lastPermissionUpdate: new Date()
    });

    return permissionDoc;
  }

  async checkFileAccess(fileId, userId, operation = 'read') {
    // Check if user has access to perform operation on file
    const filePerms = await this.permissions.findOne({
      fileId: ObjectId(fileId)
    });

    // Log access attempt
    await this.logAccess(fileId, userId, operation, filePerms ? 'authorized' : 'checking');

    if (!filePerms) {
      // No specific permissions - check default policy
      return await this.checkDefaultAccess(fileId, userId, operation);
    }

    // Check expiration
    if (filePerms.expiresAt && new Date() > filePerms.expiresAt) {
      await this.logAccess(fileId, userId, operation, 'expired');
      return { allowed: false, reason: 'permissions_expired' };
    }

    // Check public access
    if (filePerms.publicAccess && operation === 'read') {
      await this.logAccess(fileId, userId, operation, 'public_access');
      return { allowed: true, reason: 'public_access' };
    }

    // Check specific permissions
    const userRoles = await this.getUserRoles(userId);
    const allowedEntities = filePerms.permissions[operation] || [];
    
    const hasAccess = allowedEntities.some(entity => 
      entity.toString() === userId.toString() || userRoles.includes(entity.toString())
    );

    const result = { 
      allowed: hasAccess, 
      reason: hasAccess ? 'explicit_permission' : 'permission_denied',
      permissions: filePerms.permissions
    };

    await this.logAccess(fileId, userId, operation, hasAccess ? 'granted' : 'denied');
    return result;
  }

  async createSecureFileShare(fileId, shareConfig) {
    // Create secure, time-limited file share
    const shareToken = this.generateSecureToken();
    const shareDoc = {
      fileId: ObjectId(fileId),
      shareToken: shareToken,
      sharedBy: shareConfig.sharedBy,
      sharedAt: new Date(),
      expiresAt: shareConfig.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      
      // Access restrictions
      maxDownloads: shareConfig.maxDownloads || null,
      currentDownloads: 0,
      allowedIPs: shareConfig.allowedIPs || [],
      requirePassword: shareConfig.password ? true : false,
      passwordHash: shareConfig.password ? this.hashPassword(shareConfig.password) : null,
      
      // Permissions
      allowDownload: shareConfig.allowDownload !== false,
      allowView: shareConfig.allowView !== false,
      allowPreview: shareConfig.allowPreview !== false,
      
      // Tracking
      accessLog: [],
      isActive: true
    };

    await this.db.collection('file_shares').insertOne(shareDoc);
    
    // Generate secure share URL
    const shareUrl = `${process.env.BASE_URL}/shared/${shareToken}`;
    
    return {
      shareToken: shareToken,
      shareUrl: shareUrl,
      expiresAt: shareDoc.expiresAt,
      shareId: shareDoc._id
    };
  }

  async accessSharedFile(shareToken, clientIP, password = null) {
    // Access file through secure share
    const share = await this.db.collection('file_shares').findOne({
      shareToken: shareToken,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });

    if (!share) {
      return { success: false, error: 'share_not_found_or_expired' };
    }

    // Check download limit
    if (share.maxDownloads && share.currentDownloads >= share.maxDownloads) {
      return { success: false, error: 'download_limit_exceeded' };
    }

    // Check IP restrictions
    if (share.allowedIPs.length > 0 && !share.allowedIPs.includes(clientIP)) {
      return { success: false, error: 'ip_not_allowed' };
    }

    // Check password
    if (share.requirePassword) {
      if (!password || !this.verifyPassword(password, share.passwordHash)) {
        return { success: false, error: 'invalid_password' };
      }
    }

    // Update access tracking
    await this.db.collection('file_shares').updateOne(
      { _id: share._id },
      {
        $inc: { currentDownloads: 1 },
        $push: {
          accessLog: {
            accessedAt: new Date(),
            clientIP: clientIP,
            userAgent: 'unknown' // Could be passed as parameter
          }
        }
      }
    );

    return {
      success: true,
      fileId: share.fileId,
      permissions: {
        allowDownload: share.allowDownload,
        allowView: share.allowView,
        allowPreview: share.allowPreview
      }
    };
  }

  async encryptFile(fileId, encryptionKey) {
    // Encrypt file content (in-place)
    const crypto = require('crypto');
    const originalBuffer = await this.fileManager.getFileBuffer(fileId);
    const metadata = await this.fileManager.getFileMetadata(fileId);

    // Generate encryption parameters
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', encryptionKey);
    
    const encryptedBuffer = Buffer.concat([
      cipher.update(originalBuffer),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();

    // Upload encrypted version
    const encryptedFile = await this.fileManager.uploadFromBuffer(
      encryptedBuffer,
      `${metadata.filename}.encrypted`,
      {
        ...metadata.metadata,
        encrypted: true,
        encryptionAlgorithm: 'aes-256-gcm',
        encryptionIV: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        originalFileId: fileId,
        encryptedAt: new Date()
      }
    );

    // Delete original file if requested
    // await this.fileManager.deleteFile(fileId);

    return {
      encryptedFileId: encryptedFile.fileId,
      encryptionInfo: {
        algorithm: 'aes-256-gcm',
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      }
    };
  }

  async decryptFile(encryptedFileId, encryptionKey) {
    // Decrypt encrypted file
    const crypto = require('crypto');
    const encryptedBuffer = await this.fileManager.getFileBuffer(encryptedFileId);
    const metadata = await this.fileManager.getFileMetadata(encryptedFileId);

    if (!metadata.metadata.encrypted) {
      throw new Error('File is not encrypted');
    }

    const iv = Buffer.from(metadata.metadata.encryptionIV, 'hex');
    const authTag = Buffer.from(metadata.metadata.authTag, 'hex');

    const decipher = crypto.createDecipher('aes-256-gcm', encryptionKey);
    decipher.setAuthTag(authTag);

    try {
      const decryptedBuffer = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]);

      return decryptedBuffer;
    } catch (error) {
      throw new Error('Decryption failed - invalid key or corrupted file');
    }
  }

  async logAccess(fileId, userId, operation, status) {
    // Log file access for audit trail
    await this.accessLog.insertOne({
      fileId: ObjectId(fileId),
      userId: userId ? ObjectId(userId) : null,
      operation: operation,
      status: status,
      timestamp: new Date(),
      ipAddress: 'unknown', // Could be passed as parameter
      userAgent: 'unknown'  // Could be passed as parameter
    });
  }

  async getFileAccessLog(fileId, options = {}) {
    // Get access log for specific file
    const query = { fileId: ObjectId(fileId) };
    
    if (options.dateRange) {
      query.timestamp = {
        $gte: new Date(options.dateRange.start),
        $lte: new Date(options.dateRange.end)
      };
    }

    const accessEntries = await this.accessLog
      .find(query)
      .sort({ timestamp: -1 })
      .limit(options.limit || 100)
      .toArray();

    return accessEntries;
  }

  async getUserRoles(userId) {
    // Get user roles for permission checking
    // This would typically integrate with your user management system
    const user = await this.db.collection('users').findOne({
      _id: ObjectId(userId)
    });
    
    return user?.roles || [];
  }

  generateSecureToken() {
    // Generate cryptographically secure random token
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  hashPassword(password) {
    // Hash password for secure storage
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  verifyPassword(password, hash) {
    // Verify password against hash
    const crypto = require('crypto');
    const [salt, originalHash] = hash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return originalHash === verifyHash;
  }

  async checkDefaultAccess(fileId, userId, operation) {
    // Default access policy when no specific permissions set
    // This would be customized based on your application's security model
    return { 
      allowed: operation === 'read', // Default: allow read, deny write/delete
      reason: 'default_policy'
    };
  }
}
```

## SQL-Style File Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB GridFS operations:

```sql
-- QueryLeaf GridFS operations with SQL-familiar syntax

-- Upload file with metadata (SQL-style INSERT)
INSERT INTO FILES (filename, content, metadata)
VALUES (
  'annual-report-2024.pdf',
  LOAD_FILE('/path/to/annual-report-2024.pdf'),
  JSON_BUILD_OBJECT(
    'title', 'Annual Report 2024',
    'category', 'financial-reports',
    'department', 'finance',
    'confidentiality', 'internal',
    'tags', ARRAY['annual', 'report', '2024', 'finance'],
    'uploadedBy', '64f1a2c4567890abcdef1234',
    'uploadedByName', 'John Smith',
    'approvalStatus', 'pending'
  )
);

-- Query files with metadata filtering (SQL-style SELECT)
SELECT 
  file_id,
  filename,
  length as file_size,
  FORMAT_BYTES(length) as human_size,
  upload_date,
  md5_hash,
  metadata->>'title' as document_title,
  metadata->>'category' as category,
  metadata->>'department' as department,
  metadata->'tags' as tags
FROM FILES
WHERE metadata->>'category' = 'financial-reports'
  AND metadata->>'department' = 'finance'
  AND upload_date >= CURRENT_DATE - INTERVAL '1 year'
  AND length > 1024 * 1024  -- Files larger than 1MB
ORDER BY upload_date DESC;

-- Search files by content and metadata
SELECT 
  f.file_id,
  f.filename,
  f.length,
  f.metadata->>'title' as title,
  f.metadata->>'category' as category,
  CASE 
    WHEN f.metadata->>'confidentiality' = 'public' THEN 'Public'
    WHEN f.metadata->>'confidentiality' = 'internal' THEN 'Internal'
    WHEN f.metadata->>'confidentiality' = 'confidential' THEN 'Confidential'
    ELSE 'Unknown'
  END as access_level
FROM FILES f
WHERE (f.filename ILIKE '%report%' 
   OR f.metadata->>'title' ILIKE '%financial%'
   OR f.metadata->'tags' @> '["quarterly"]')
  AND f.metadata->>'approvalStatus' = 'approved'
ORDER BY f.upload_date DESC
LIMIT 50;

-- File operations with streaming and processing
-- Download file content
SELECT 
  file_id,
  filename,
  DOWNLOAD_FILE(file_id) as file_content,
  metadata
FROM FILES
WHERE file_id = '64f1a2c4567890abcdef1234';

-- Stream file content in chunks (for large files)
SELECT 
  file_id,
  filename,
  STREAM_FILE_RANGE(file_id, 0, 1048576) as chunk_content,  -- First 1MB
  FORMAT_BYTES(length) as total_size
FROM FILES
WHERE file_id = '64f1a2c4567890abcdef1234';

-- File processing operations
-- Generate thumbnail for image file
INSERT INTO FILES (filename, content, metadata)
SELECT 
  CONCAT(REPLACE(filename, '.', '_thumbnail.'), 'jpg'),
  GENERATE_THUMBNAIL(file_id, 150, 150) as thumbnail_content,
  JSON_BUILD_OBJECT(
    'category', 'thumbnail',
    'thumbnailOf', file_id,
    'generatedAt', CURRENT_TIMESTAMP,
    'dimensions', JSON_BUILD_OBJECT('width', 150, 'height', 150)
  )
FROM FILES
WHERE metadata->>'category' = 'image'
  AND file_id = '64f1a2c4567890abcdef1234';

-- Extract text content from documents
UPDATE FILES
SET metadata = metadata || JSON_BUILD_OBJECT(
  'extractedText', EXTRACT_TEXT(file_id),
  'textExtracted', true,
  'textExtractionDate', CURRENT_TIMESTAMP,
  'wordCount', WORD_COUNT(EXTRACT_TEXT(file_id))
)
WHERE metadata->>'mimeType' IN ('application/pdf', 'application/msword')
  AND (metadata->>'textExtracted')::boolean IS NOT TRUE;

-- File analytics and statistics
SELECT 
  metadata->>'category' as file_category,
  COUNT(*) as file_count,
  SUM(length) as total_bytes,
  FORMAT_BYTES(SUM(length)) as total_size,
  AVG(length) as avg_file_size,
  FORMAT_BYTES(AVG(length)) as avg_human_size,
  MIN(upload_date) as oldest_file,
  MAX(upload_date) as newest_file
FROM FILES
WHERE upload_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY metadata->>'category'
ORDER BY total_bytes DESC;

-- File access permissions and security
-- Set file permissions
UPDATE FILES
SET metadata = metadata || JSON_BUILD_OBJECT(
  'permissions', JSON_BUILD_OBJECT(
    'read', ARRAY['finance', 'management', 'audit'],
    'write', ARRAY['finance'],
    'admin', ARRAY['finance-manager']
  ),
  'hasCustomPermissions', true,
  'lastPermissionUpdate', CURRENT_TIMESTAMP
)
WHERE file_id = '64f1a2c4567890abcdef1234';

-- Check user access to files
SELECT 
  f.file_id,
  f.filename,
  f.metadata->>'title' as title,
  CHECK_FILE_ACCESS(f.file_id, '64f1a2c4567890abcdef9999', 'read') as can_read,
  CHECK_FILE_ACCESS(f.file_id, '64f1a2c4567890abcdef9999', 'write') as can_write,
  CHECK_FILE_ACCESS(f.file_id, '64f1a2c4567890abcdef9999', 'delete') as can_delete
FROM FILES f
WHERE f.metadata->>'category' = 'financial-reports'
ORDER BY f.upload_date DESC;

-- Create secure file sharing links
INSERT INTO file_shares (
  file_id,
  share_token,
  shared_by,
  expires_at,
  max_downloads,
  allow_download,
  created_at
)
SELECT 
  file_id,
  GENERATE_SECURE_TOKEN() as share_token,
  '64f1a2c4567890abcdef1111' as shared_by,
  CURRENT_TIMESTAMP + INTERVAL '7 days' as expires_at,
  5 as max_downloads,
  true as allow_download,
  CURRENT_TIMESTAMP
FROM FILES
WHERE file_id = '64f1a2c4567890abcdef1234';

-- File versioning and history
-- Create file version
INSERT INTO FILES (filename, content, metadata)
SELECT 
  filename,
  content,
  metadata || JSON_BUILD_OBJECT(
    'version', COALESCE((metadata->>'version')::numeric, 0) + 1,
    'previousVersion', file_id,
    'versionCreated', CURRENT_TIMESTAMP,
    'versionCreatedBy', '64f1a2c4567890abcdef2222'
  )
FROM FILES
WHERE file_id = '64f1a2c4567890abcdef1234';

-- Get file version history
WITH file_versions AS (
  SELECT 
    file_id,
    filename,
    upload_date,
    metadata->>'version' as version,
    metadata->>'previousVersion' as previous_version,
    metadata->>'versionCreatedBy' as created_by,
    length
  FROM FILES
  WHERE filename = 'annual-report-2024.pdf'
    OR metadata->>'previousVersion' = '64f1a2c4567890abcdef1234'
)
SELECT 
  file_id,
  version,
  upload_date as version_date,
  created_by,
  FORMAT_BYTES(length) as file_size,
  LAG(version, 1) OVER (ORDER BY version) as previous_version
FROM file_versions
ORDER BY version DESC;

-- Bulk file operations
-- Archive old files by moving to archive category
UPDATE FILES
SET metadata = metadata || JSON_BUILD_OBJECT(
  'category', 'archived',
  'archivedAt', CURRENT_TIMESTAMP,
  'originalCategory', metadata->>'category'
)
WHERE upload_date < CURRENT_DATE - INTERVAL '2 years'
  AND metadata->>'category' NOT IN ('archived', 'permanent');

-- Create ZIP archive of related files
INSERT INTO FILES (filename, content, metadata)
SELECT 
  'financial-reports-2024.zip' as filename,
  CREATE_ZIP_ARCHIVE(ARRAY_AGG(file_id)) as content,
  JSON_BUILD_OBJECT(
    'category', 'archive',
    'archiveType', 'zip',
    'containedFiles', ARRAY_AGG(file_id),
    'fileCount', COUNT(*),
    'createdAt', CURRENT_TIMESTAMP
  ) as metadata
FROM FILES
WHERE metadata->>'category' = 'financial-reports'
  AND upload_date >= '2024-01-01'
  AND upload_date < '2025-01-01';

-- File duplicate detection and cleanup
WITH file_duplicates AS (
  SELECT 
    md5_hash,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(file_id ORDER BY upload_date) as file_ids,
    ARRAY_AGG(filename ORDER BY upload_date) as filenames,
    MIN(upload_date) as first_uploaded,
    MAX(upload_date) as last_uploaded,
    SUM(length) as total_wasted_space
  FROM FILES
  GROUP BY md5_hash
  HAVING COUNT(*) > 1
)
SELECT 
  md5_hash,
  duplicate_count,
  filenames[1] as original_filename,
  first_uploaded,
  last_uploaded,
  FORMAT_BYTES(total_wasted_space) as wasted_space,
  -- Get file IDs to keep (first) and delete (rest)
  file_ids[1] as keep_file_id,
  file_ids[2:] as delete_file_ids
FROM file_duplicates
ORDER BY total_wasted_space DESC;

-- Storage optimization and maintenance
SELECT 
  -- Storage usage by category
  'storage_by_category' as metric_type,
  metadata->>'category' as category,
  COUNT(*) as file_count,
  SUM(length) as total_bytes,
  FORMAT_BYTES(SUM(length)) as total_size,
  ROUND((SUM(length)::float / (SELECT SUM(length) FROM FILES)) * 100, 2) as percentage_of_total
FROM FILES
GROUP BY metadata->>'category'

UNION ALL

SELECT 
  -- Large files analysis
  'large_files' as metric_type,
  'files_over_100mb' as category,
  COUNT(*) as file_count,
  SUM(length) as total_bytes,
  FORMAT_BYTES(SUM(length)) as total_size,
  ROUND((SUM(length)::float / (SELECT SUM(length) FROM FILES)) * 100, 2) as percentage_of_total
FROM FILES
WHERE length > 100 * 1024 * 1024

UNION ALL

SELECT 
  -- Old files analysis
  'old_files' as metric_type,
  'files_over_1_year_old' as category,
  COUNT(*) as file_count,
  SUM(length) as total_bytes,
  FORMAT_BYTES(SUM(length)) as total_size,
  ROUND((SUM(length)::float / (SELECT SUM(length) FROM FILES)) * 100, 2) as percentage_of_total
FROM FILES
WHERE upload_date < CURRENT_DATE - INTERVAL '1 year'

ORDER BY metric_type, total_bytes DESC;

-- QueryLeaf provides comprehensive GridFS functionality:
-- 1. SQL-familiar file upload and download operations
-- 2. Rich metadata querying and filtering capabilities
-- 3. File processing functions (thumbnails, text extraction)
-- 4. Access control and permission management
-- 5. File versioning and history tracking
-- 6. Bulk operations and archive creation
-- 7. Storage analytics and optimization tools
-- 8. Duplicate detection and cleanup operations
-- 9. Secure file sharing with expiration controls
-- 10. Integration with MongoDB's native GridFS capabilities
```

## Best Practices for GridFS File Storage

### Design Guidelines

Essential practices for effective GridFS usage:

1. **Chunk Size Optimization**: Choose appropriate chunk sizes based on file types and usage patterns
2. **Metadata Design**: Structure metadata for efficient querying and filtering
3. **Index Strategy**: Create proper indexes on metadata fields for fast file discovery
4. **Security Implementation**: Implement proper access controls and permission systems
5. **Storage Management**: Monitor storage usage and implement lifecycle policies
6. **Performance Optimization**: Use appropriate connection pooling and streaming techniques

### Use Case Selection

Choose GridFS for appropriate scenarios:

1. **Large File Storage**: Files larger than 16MB that exceed BSON document limits
2. **Media Management**: Images, videos, audio files with rich metadata requirements
3. **Document Management**: PDF, Word, Excel files with content indexing needs
4. **Backup Storage**: Database backups, system archives with metadata tracking
5. **User-Generated Content**: Profile images, file uploads with permission controls
6. **Binary Data Integration**: Any binary data that benefits from database integration

## Conclusion

MongoDB GridFS provides powerful, native file storage capabilities that eliminate the complexity of external file systems while delivering sophisticated metadata management, security controls, and processing capabilities. Combined with SQL-familiar file operations, GridFS enables comprehensive binary data solutions that integrate seamlessly with your document database.

Key GridFS benefits include:

- **Native Integration**: Built-in file storage without external dependencies
- **Unlimited Size**: Handle files of any size with automatic chunking and streaming
- **Rich Metadata**: Comprehensive metadata storage with full query capabilities
- **Transactional Consistency**: Atomic operations across file data and metadata
- **Built-in Replication**: Automatic file replication with your database infrastructure

Whether you're building document management systems, media platforms, content management solutions, or applications requiring large binary data storage, MongoDB GridFS with QueryLeaf's familiar SQL interface provides the foundation for scalable file storage. This combination enables you to implement sophisticated file management capabilities while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB GridFS operations while providing SQL-familiar file upload, download, and query syntax. Complex file processing, metadata management, and security controls are seamlessly handled through familiar SQL patterns, making advanced file storage both powerful and accessible.

The integration of native file storage with SQL-style operations makes MongoDB an ideal platform for applications requiring both sophisticated file management and familiar database interaction patterns, ensuring your file storage solutions remain both effective and maintainable as they scale and evolve.