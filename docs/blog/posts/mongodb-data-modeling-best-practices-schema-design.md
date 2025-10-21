---
title: "MongoDB Data Modeling Best Practices and Schema Design: Advanced Document Structure Optimization and Relationship Management for Scalable Applications"
description: "Master MongoDB data modeling with advanced schema design patterns, relationship optimization, and performance-focused document structures. Learn embedding vs referencing strategies and SQL-familiar modeling techniques for scalable database architectures."
date: 2025-10-20
tags: [mongodb, data-modeling, schema-design, document-structure, relationships, performance, sql]
---

# MongoDB Data Modeling Best Practices and Schema Design: Advanced Document Structure Optimization and Relationship Management for Scalable Applications

Modern applications require sophisticated data modeling strategies that can handle complex relationships, evolving schemas, and high-performance requirements while maintaining data consistency and query flexibility. Traditional relational modeling approaches often struggle with document-oriented data, nested structures, and the dynamic schema requirements of modern applications, leading to complex object-relational mapping, rigid schema constraints, and performance bottlenecks that limit application scalability and development velocity.

MongoDB provides comprehensive data modeling capabilities through flexible document structures, embedded relationships, and advanced schema design patterns that enable sophisticated data organization with optimal performance characteristics. Unlike traditional databases that enforce rigid table structures and require complex joins, MongoDB integrates data modeling directly into the document structure with native support for arrays, nested objects, and flexible schemas that adapt to application requirements.

## The Traditional Relational Data Modeling Challenge

Conventional approaches to data modeling in relational systems face significant limitations when handling complex, hierarchical, and rapidly evolving data structures:

```sql
-- Traditional relational data modeling - rigid schema with complex relationship management

-- Basic user management with limited flexibility
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    
    -- Basic profile information (limited structure)
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    phone_number VARCHAR(20),
    
    -- Address information (denormalized for simplicity)
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    
    -- Account metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    account_status VARCHAR(50) DEFAULT 'active',
    
    -- Basic preferences (very limited)
    preferred_language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Social media links (limited and rigid)
    facebook_url VARCHAR(255),
    twitter_url VARCHAR(255),
    linkedin_url VARCHAR(255),
    instagram_url VARCHAR(255)
);

-- Separate table for user profiles (normalized approach)
CREATE TABLE user_profiles (
    profile_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Extended profile information
    bio TEXT,
    website VARCHAR(255),
    company VARCHAR(255),
    job_title VARCHAR(255),
    
    -- Skills and interests (very basic approach)
    skills TEXT, -- Comma-separated values - not optimal
    interests TEXT, -- Comma-separated values - not optimal
    
    -- Professional information
    years_of_experience INTEGER,
    education_level VARCHAR(100),
    
    -- Contact preferences
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    marketing_emails BOOLEAN DEFAULT false,
    
    -- Profile metadata
    profile_completeness_percent DECIMAL(5,2) DEFAULT 0.0,
    profile_visibility VARCHAR(50) DEFAULT 'public',
    
    -- Profile customization (limited)
    theme VARCHAR(50) DEFAULT 'default',
    profile_picture_url VARCHAR(255),
    cover_photo_url VARCHAR(255)
);

-- User posts with basic relationship management
CREATE TABLE posts (
    post_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Post content
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    post_type VARCHAR(50) DEFAULT 'article',
    
    -- Post metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    
    -- Post status and visibility
    status VARCHAR(50) DEFAULT 'draft',
    visibility VARCHAR(50) DEFAULT 'public',
    
    -- SEO and categorization
    slug VARCHAR(500) UNIQUE,
    meta_description TEXT,
    featured_image_url VARCHAR(255),
    
    -- Engagement metrics (basic)
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    
    -- Content flags
    is_featured BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    allow_comments BOOLEAN DEFAULT true
);

-- Post categories (many-to-many relationship)
CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(255) UNIQUE NOT NULL,
    category_slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    parent_category_id INTEGER REFERENCES categories(category_id),
    
    -- Category metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    -- Category appearance
    color VARCHAR(7), -- Hex color code
    icon VARCHAR(100) -- Icon identifier
);

-- Post-category relationships (junction table)
CREATE TABLE post_categories (
    post_id INTEGER REFERENCES posts(post_id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(category_id) ON DELETE CASCADE,
    
    PRIMARY KEY (post_id, category_id),
    
    -- Relationship metadata
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER REFERENCES users(user_id)
);

-- Comments with hierarchical structure (self-referencing)
CREATE TABLE comments (
    comment_id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(post_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES comments(comment_id) ON DELETE CASCADE,
    
    -- Comment content
    content TEXT NOT NULL,
    comment_type VARCHAR(50) DEFAULT 'text',
    
    -- Comment metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Comment status
    status VARCHAR(50) DEFAULT 'published',
    is_edited BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    
    -- Engagement
    like_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    
    -- Moderation
    is_flagged BOOLEAN DEFAULT false,
    moderation_status VARCHAR(50) DEFAULT 'approved'
);

-- Tags for flexible categorization (many-to-many)
CREATE TABLE tags (
    tag_id SERIAL PRIMARY KEY,
    tag_name VARCHAR(255) UNIQUE NOT NULL,
    tag_slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    
    -- Tag metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    is_trending BOOLEAN DEFAULT false,
    
    -- Tag appearance
    color VARCHAR(7)
);

-- Post-tag relationships
CREATE TABLE post_tags (
    post_id INTEGER REFERENCES posts(post_id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(tag_id) ON DELETE CASCADE,
    
    PRIMARY KEY (post_id, tag_id),
    
    -- Relationship metadata
    tagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tagged_by INTEGER REFERENCES users(user_id),
    relevance_score DECIMAL(3,2) DEFAULT 1.0
);

-- Complex query to retrieve post with all relationships (performance issues)
WITH post_data AS (
    SELECT 
        p.post_id,
        p.title,
        p.content,
        p.created_at,
        p.status,
        p.view_count,
        p.like_count,
        p.comment_count,
        
        -- User information (requires join)
        u.username,
        u.email,
        up.bio,
        up.profile_picture_url,
        
        -- Categories (requires aggregation)
        STRING_AGG(DISTINCT c.category_name, ', ' ORDER BY c.category_name) as categories,
        
        -- Tags (requires aggregation)
        STRING_AGG(DISTINCT t.tag_name, ', ' ORDER BY t.tag_name) as tags
        
    FROM posts p
    JOIN users u ON p.user_id = u.user_id
    LEFT JOIN user_profiles up ON u.user_id = up.user_id
    LEFT JOIN post_categories pc ON p.post_id = pc.post_id
    LEFT JOIN categories c ON pc.category_id = c.category_id
    LEFT JOIN post_tags pt ON p.post_id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.tag_id
    
    WHERE p.status = 'published'
    GROUP BY 
        p.post_id, p.title, p.content, p.created_at, p.status, 
        p.view_count, p.like_count, p.comment_count,
        u.username, u.email, up.bio, up.profile_picture_url
),

comment_hierarchy AS (
    -- Recursive CTE for nested comments (complex and performance-intensive)
    WITH RECURSIVE comment_tree AS (
        SELECT 
            c.comment_id,
            c.post_id,
            c.content,
            c.created_at,
            c.parent_comment_id,
            u.username as commenter_username,
            up.profile_picture_url as commenter_picture,
            0 as depth,
            CAST(c.comment_id as TEXT) as path
        FROM comments c
        JOIN users u ON c.user_id = u.user_id
        LEFT JOIN user_profiles up ON u.user_id = up.user_id
        WHERE c.parent_comment_id IS NULL
        AND c.status = 'published'
        
        UNION ALL
        
        SELECT 
            c.comment_id,
            c.post_id,
            c.content,
            c.created_at,
            c.parent_comment_id,
            u.username,
            up.profile_picture_url,
            ct.depth + 1,
            ct.path || '.' || c.comment_id
        FROM comments c
        JOIN users u ON c.user_id = u.user_id
        LEFT JOIN user_profiles up ON u.user_id = up.user_id
        JOIN comment_tree ct ON c.parent_comment_id = ct.comment_id
        WHERE c.status = 'published'
        AND ct.depth < 5 -- Limit recursion depth
    )
    SELECT 
        post_id,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'comment_id', comment_id,
                'content', content,
                'created_at', created_at,
                'commenter_username', commenter_username,
                'commenter_picture', commenter_picture,
                'depth', depth,
                'path', path
            ) ORDER BY path
        ) as comments_json
    FROM comment_tree
    GROUP BY post_id
)

SELECT 
    pd.post_id,
    pd.title,
    pd.content,
    pd.created_at,
    pd.username as author_username,
    pd.bio as author_bio,
    pd.profile_picture_url as author_picture,
    pd.categories,
    pd.tags,
    pd.view_count,
    pd.like_count,
    pd.comment_count,
    
    -- Comments as JSON (complex aggregation)
    COALESCE(ch.comments_json, '[]'::json) as comments
    
FROM post_data pd
LEFT JOIN comment_hierarchy ch ON pd.post_id = ch.post_id
ORDER BY pd.created_at DESC;

-- Basic user activity analysis (multiple complex joins)
WITH user_activity AS (
    SELECT 
        u.user_id,
        u.username,
        u.email,
        u.created_at as user_created_at,
        
        -- Post statistics
        COUNT(DISTINCT p.post_id) as total_posts,
        COUNT(DISTINCT CASE WHEN p.status = 'published' THEN p.post_id END) as published_posts,
        SUM(p.view_count) as total_views,
        SUM(p.like_count) as total_likes,
        
        -- Comment statistics
        COUNT(DISTINCT c.comment_id) as total_comments,
        
        -- Category usage
        COUNT(DISTINCT pc.category_id) as categories_used,
        
        -- Tag usage
        COUNT(DISTINCT pt.tag_id) as tags_used,
        
        -- Activity timeline
        MAX(GREATEST(p.created_at, c.created_at)) as last_activity_at,
        
        -- Engagement metrics
        AVG(p.view_count) as avg_views_per_post,
        AVG(p.like_count) as avg_likes_per_post,
        AVG(p.comment_count) as avg_comments_per_post
        
    FROM users u
    LEFT JOIN posts p ON u.user_id = p.user_id
    LEFT JOIN comments c ON u.user_id = c.user_id
    LEFT JOIN post_categories pc ON p.post_id = pc.post_id
    LEFT JOIN post_tags pt ON p.post_id = pt.post_id
    
    WHERE u.account_status = 'active'
    GROUP BY u.user_id, u.username, u.email, u.created_at
),

engagement_analysis AS (
    SELECT 
        ua.*,
        
        -- Activity classification
        CASE 
            WHEN ua.total_posts > 50 AND ua.total_comments > 100 THEN 'highly_active'
            WHEN ua.total_posts > 10 AND ua.total_comments > 25 THEN 'moderately_active'
            WHEN ua.total_posts > 0 OR ua.total_comments > 0 THEN 'low_activity'
            ELSE 'inactive'
        END as activity_level,
        
        -- Content quality indicators
        CASE 
            WHEN ua.avg_views_per_post > 1000 AND ua.avg_likes_per_post > 50 THEN 'high_quality'
            WHEN ua.avg_views_per_post > 500 AND ua.avg_likes_per_post > 20 THEN 'good_quality'
            WHEN ua.avg_views_per_post > 100 THEN 'average_quality'
            ELSE 'low_engagement'
        END as content_quality,
        
        -- User tenure
        EXTRACT(DAYS FROM CURRENT_TIMESTAMP - ua.user_created_at) as days_since_signup,
        EXTRACT(DAYS FROM CURRENT_TIMESTAMP - ua.last_activity_at) as days_since_last_activity,
        
        -- Productivity metrics
        CASE 
            WHEN EXTRACT(DAYS FROM CURRENT_TIMESTAMP - ua.user_created_at) > 0 THEN
                ua.total_posts / EXTRACT(DAYS FROM CURRENT_TIMESTAMP - ua.user_created_at)::DECIMAL
            ELSE 0
        END as posts_per_day,
        
        -- Diversity metrics
        CASE 
            WHEN ua.total_posts > 0 THEN ua.categories_used / ua.total_posts::DECIMAL
            ELSE 0
        END as category_diversity,
        
        CASE 
            WHEN ua.total_posts > 0 THEN ua.tags_used / ua.total_posts::DECIMAL
            ELSE 0
        END as tag_diversity
        
    FROM user_activity ua
)

SELECT 
    ea.username,
    ea.activity_level,
    ea.content_quality,
    ea.total_posts,
    ea.published_posts,
    ROUND(ea.total_views, 0) as total_views,
    ROUND(ea.total_likes, 0) as total_likes,
    ea.total_comments,
    
    -- Engagement metrics
    ROUND(ea.avg_views_per_post, 1) as avg_views_per_post,
    ROUND(ea.avg_likes_per_post, 1) as avg_likes_per_post,
    ROUND(ea.avg_comments_per_post, 1) as avg_comments_per_post,
    
    -- Activity metrics
    ROUND(ea.posts_per_day, 3) as posts_per_day,
    ROUND(ea.category_diversity, 2) as category_diversity,
    ROUND(ea.tag_diversity, 2) as tag_diversity,
    
    -- Time metrics
    ea.days_since_signup,
    ea.days_since_last_activity,
    
    -- Recommendations
    CASE 
        WHEN ea.activity_level = 'inactive' AND ea.days_since_signup < 30 THEN 'new_user_onboarding'
        WHEN ea.activity_level = 'low_activity' AND ea.days_since_last_activity > 30 THEN 're_engagement_campaign'
        WHEN ea.content_quality = 'high_quality' THEN 'featured_contributor'
        WHEN ea.activity_level = 'highly_active' AND ea.content_quality != 'high_quality' THEN 'content_improvement_guidance'
        ELSE 'continue_monitoring'
    END as engagement_recommendation
    
FROM engagement_analysis ea
ORDER BY ea.total_views DESC, ea.total_posts DESC;

-- Problems with traditional relational data modeling:
-- 1. Rigid schema requiring extensive migrations for changes
-- 2. Complex joins across multiple tables for simple data retrieval
-- 3. Object-relational impedance mismatch for nested data structures
-- 4. Performance overhead from normalization and multiple table queries
-- 5. Difficulty modeling hierarchical and semi-structured data
-- 6. Limited flexibility for evolving application requirements
-- 7. Complex relationship management requiring junction tables
-- 8. Inefficient storage for sparse or optional data fields
-- 9. Challenging aggregation across related entities
-- 10. Maintenance complexity for schema evolution and data migration
```

MongoDB provides comprehensive data modeling capabilities with flexible document structures and embedded relationships:

```javascript
// MongoDB Advanced Data Modeling - flexible document structures with optimized relationships
const { MongoClient, ObjectId } = require('mongodb');

// Comprehensive MongoDB Data Modeling Manager
class AdvancedDataModelingManager {
  constructor(mongoUri, modelingConfig = {}) {
    this.mongoUri = mongoUri;
    this.client = null;
    this.db = null;
    
    // Data modeling configuration
    this.config = {
      // Schema validation settings
      enableSchemaValidation: modelingConfig.enableSchemaValidation !== false,
      strictValidation: modelingConfig.strictValidation || false,
      validationLevel: modelingConfig.validationLevel || 'moderate',
      
      // Document design preferences
      embeddingStrategy: modelingConfig.embeddingStrategy || 'balanced', // balanced, aggressive, conservative
      referencingThreshold: modelingConfig.referencingThreshold || 100, // Size threshold for referencing
      denormalizationLevel: modelingConfig.denormalizationLevel || 'moderate',
      
      // Performance optimization
      enableIndexOptimization: modelingConfig.enableIndexOptimization !== false,
      enableAggregationOptimization: modelingConfig.enableAggregationOptimization || false,
      enableQueryPatternAnalysis: modelingConfig.enableQueryPatternAnalysis || false,
      
      // Relationship management
      cascadeDeletes: modelingConfig.cascadeDeletes || false,
      maintainReferentialIntegrity: modelingConfig.maintainReferentialIntegrity || false,
      enableRelationshipIndexing: modelingConfig.enableRelationshipIndexing !== false,
      
      // Schema evolution
      enableSchemaEvolution: modelingConfig.enableSchemaEvolution || false,
      backwardCompatibility: modelingConfig.backwardCompatibility !== false,
      versionedSchemas: modelingConfig.versionedSchemas || false
    };
    
    // Document schemas and relationships
    this.documentSchemas = new Map();
    this.relationshipMappings = new Map();
    this.validationRules = new Map();
    
    // Performance and optimization state
    this.queryPatterns = new Map();
    this.indexStrategies = new Map();
    this.optimizationRecommendations = [];
    
    this.initializeDataModeling();
  }

  async initializeDataModeling() {
    console.log('Initializing advanced MongoDB data modeling...');
    
    try {
      // Connect to MongoDB
      this.client = new MongoClient(this.mongoUri);
      await this.client.connect();
      this.db = this.client.db();
      
      // Setup comprehensive user schema with embedded relationships
      await this.defineUserSchema();
      
      // Setup post schema with flexible content structure
      await this.definePostSchema();
      
      // Setup optimized indexes for performance
      if (this.config.enableIndexOptimization) {
        await this.setupOptimizedIndexes();
      }
      
      // Initialize schema validation if enabled
      if (this.config.enableSchemaValidation) {
        await this.applySchemaValidation();
      }
      
      console.log('Advanced data modeling initialized successfully');
      
    } catch (error) {
      console.error('Error initializing data modeling:', error);
      throw error;
    }
  }

  async defineUserSchema() {
    console.log('Defining comprehensive user schema with embedded relationships...');
    
    try {
      const userSchema = {
        // Schema metadata
        schemaVersion: '1.0',
        schemaName: 'user_profile',
        lastUpdated: new Date(),
        
        // Document structure
        documentStructure: {
          // Core identification
          _id: 'ObjectId',
          userId: 'string', // Application-level ID
          username: 'string',
          email: 'string',
          
          // Personal information (embedded object)
          profile: {
            firstName: 'string',
            lastName: 'string',
            displayName: 'string',
            bio: 'string',
            dateOfBirth: 'date',
            phoneNumber: 'string',
            
            // Professional information
            company: 'string',
            jobTitle: 'string',
            yearsOfExperience: 'number',
            educationLevel: 'string',
            
            // Skills and interests (arrays for flexibility)
            skills: ['string'],
            interests: ['string'],
            languages: [
              {
                language: 'string',
                proficiency: 'string' // beginner, intermediate, advanced, native
              }
            ],
            
            // Social media links (flexible object)
            socialMedia: {
              facebook: 'string',
              twitter: 'string',
              linkedin: 'string',
              instagram: 'string',
              github: 'string',
              website: 'string'
            },
            
            // Profile media
            profilePicture: {
              url: 'string',
              thumbnailUrl: 'string',
              uploadedAt: 'date',
              fileSize: 'number',
              dimensions: {
                width: 'number',
                height: 'number'
              }
            },
            
            coverPhoto: {
              url: 'string',
              uploadedAt: 'date',
              fileSize: 'number'
            }
          },
          
          // Contact information (embedded for locality)
          contact: {
            addresses: [
              {
                type: 'string', // home, work, billing, shipping
                addressLine1: 'string',
                addressLine2: 'string',
                city: 'string',
                state: 'string',
                postalCode: 'string',
                country: 'string',
                isPrimary: 'boolean',
                coordinates: {
                  latitude: 'number',
                  longitude: 'number'
                }
              }
            ],
            
            phoneNumbers: [
              {
                type: 'string', // mobile, home, work
                number: 'string',
                countryCode: 'string',
                isPrimary: 'boolean',
                isVerified: 'boolean'
              }
            ],
            
            emailAddresses: [
              {
                email: 'string',
                type: 'string', // primary, work, personal
                isVerified: 'boolean',
                isPrimary: 'boolean'
              }
            ]
          },
          
          // Account settings and preferences (embedded)
          settings: {
            // Privacy settings
            privacy: {
              profileVisibility: 'string', // public, private, friends
              emailVisible: 'boolean',
              phoneVisible: 'boolean',
              searchable: 'boolean'
            },
            
            // Notification preferences
            notifications: {
              email: {
                posts: 'boolean',
                comments: 'boolean',
                mentions: 'boolean',
                messages: 'boolean',
                newsletter: 'boolean',
                marketing: 'boolean'
              },
              push: {
                posts: 'boolean',
                comments: 'boolean',
                mentions: 'boolean',
                messages: 'boolean'
              },
              sms: {
                security: 'boolean',
                important: 'boolean'
              }
            },
            
            // UI preferences
            interface: {
              theme: 'string', // light, dark, auto
              language: 'string',
              timezone: 'string',
              dateFormat: 'string',
              currency: 'string'
            },
            
            // Content preferences
            content: {
              defaultPostVisibility: 'string',
              autoSaveEnabled: 'boolean',
              contentLanguages: ['string']
            }
          },
          
          // Activity tracking (embedded for performance)
          activity: {
            // Account lifecycle
            createdAt: 'date',
            updatedAt: 'date',
            lastLoginAt: 'date',
            lastActiveAt: 'date',
            
            // Status information
            status: 'string', // active, inactive, suspended, deleted
            emailVerifiedAt: 'date',
            phoneVerifiedAt: 'date',
            
            // Statistics (denormalized for performance)
            stats: {
              totalPosts: 'number',
              publishedPosts: 'number',
              totalComments: 'number',
              totalLikes: 'number',
              totalViews: 'number',
              followersCount: 'number',
              followingCount: 'number',
              
              // Calculated metrics
              engagementRate: 'number',
              averagePostViews: 'number',
              profileCompleteness: 'number'
            },
            
            // Activity timeline (recent activities embedded)
            recentActivities: [
              {
                type: 'string', // login, post_created, comment_posted, profile_updated
                timestamp: 'date',
                details: 'object', // Flexible details object
                ipAddress: 'string',
                userAgent: 'string'
              }
            ]
          },
          
          // Authentication and security (embedded)
          authentication: {
            passwordHash: 'string',
            passwordSalt: 'string',
            lastPasswordChange: 'date',
            
            // Two-factor authentication
            twoFactorEnabled: 'boolean',
            twoFactorSecret: 'string',
            backupCodes: ['string'],
            
            // Session management
            activeSessions: [
              {
                sessionId: 'string',
                createdAt: 'date',
                lastActivityAt: 'date',
                ipAddress: 'string',
                userAgent: 'string',
                deviceInfo: 'object'
              }
            ],
            
            // Security events
            securityEvents: [
              {
                type: 'string', // login_attempt, password_change, suspicious_activity
                timestamp: 'date',
                details: 'object',
                resolved: 'boolean'
              }
            ]
          },
          
          // Content relationships (selective referencing for large collections)
          content: {
            // Recent posts (embedded for performance)
            recentPosts: [
              {
                postId: 'ObjectId',
                title: 'string',
                createdAt: 'date',
                status: 'string',
                viewCount: 'number',
                likeCount: 'number'
              }
            ],
            
            // Favorite posts (referenced due to potential size)
            favoritePostIds: ['ObjectId'],
            
            // Bookmarked content
            bookmarks: [
              {
                contentId: 'ObjectId',
                contentType: 'string', // post, comment, user
                bookmarkedAt: 'date',
                tags: ['string'],
                notes: 'string'
              }
            ]
          },
          
          // Social relationships (hybrid approach)
          social: {
            // Close relationships (embedded for performance)
            following: [
              {
                userId: 'ObjectId',
                username: 'string',
                followedAt: 'date',
                relationshipType: 'string' // friend, colleague, interest
              }
            ],
            
            // Large follower lists (referenced)
            followerIds: ['ObjectId'],
            
            // Social groups and communities
            groups: [
              {
                groupId: 'ObjectId',
                groupName: 'string',
                role: 'string', // member, moderator, admin
                joinedAt: 'date'
              }
            ]
          },
          
          // Flexible metadata for extensibility
          metadata: {
            customFields: 'object', // Application-specific fields
            tags: ['string'],
            categories: ['string'],
            source: 'string', // registration_source
            referrer: 'string'
          }
        },
        
        // Validation rules
        validationRules: {
          required: ['username', 'email', 'profile.firstName', 'profile.lastName'],
          unique: ['username', 'email', 'userId'],
          patterns: {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            username: /^[a-zA-Z0-9_]{3,30}$/
          },
          ranges: {
            'profile.yearsOfExperience': { min: 0, max: 70 },
            'activity.stats.profileCompleteness': { min: 0, max: 100 }
          }
        },
        
        // Index strategies for optimal performance
        indexStrategies: [
          { fields: { username: 1 }, unique: true },
          { fields: { email: 1 }, unique: true },
          { fields: { userId: 1 }, unique: true },
          { fields: { 'activity.lastActiveAt': -1 } },
          { fields: { 'activity.createdAt': -1 } },
          { fields: { 'profile.skills': 1 } },
          { fields: { 'metadata.tags': 1 } },
          
          // Compound indexes for common query patterns
          { fields: { 'activity.status': 1, 'activity.lastActiveAt': -1 } },
          { fields: { 'profile.company': 1, 'profile.jobTitle': 1 } },
          { fields: { 'settings.privacy.profileVisibility': 1, 'activity.stats.totalPosts': -1 } }
        ]
      };
      
      // Store schema definition
      this.documentSchemas.set('users', userSchema);
      
      console.log('User schema defined with embedded relationships and flexible structure');
      
    } catch (error) {
      console.error('Error defining user schema:', error);
      throw error;
    }
  }

  async definePostSchema() {
    console.log('Defining flexible post schema with content optimization...');
    
    try {
      const postSchema = {
        // Schema metadata
        schemaVersion: '1.0',
        schemaName: 'content_post',
        lastUpdated: new Date(),
        
        // Document structure optimized for content management
        documentStructure: {
          // Core identification
          _id: 'ObjectId',
          postId: 'string', // Application-level ID
          slug: 'string', // URL-friendly identifier
          
          // Author information (denormalized for performance)
          author: {
            userId: 'ObjectId',
            username: 'string',
            displayName: 'string',
            profilePicture: 'string',
            
            // Author stats (denormalized)
            totalPosts: 'number',
            followerCount: 'number',
            verified: 'boolean'
          },
          
          // Content structure (flexible for different content types)
          content: {
            // Basic content information
            title: 'string',
            subtitle: 'string',
            excerpt: 'string',
            body: 'string', // Main content
            contentType: 'string', // article, tutorial, review, announcement
            
            // Rich content elements
            media: [
              {
                type: 'string', // image, video, audio, embed
                url: 'string',
                thumbnailUrl: 'string',
                caption: 'string',
                altText: 'string',
                dimensions: {
                  width: 'number',
                  height: 'number'
                },
                fileSize: 'number',
                mimeType: 'string',
                duration: 'number', // For video/audio
                uploadedAt: 'date'
              }
            ],
            
            // Content structure and formatting
            sections: [
              {
                type: 'string', // paragraph, heading, list, code, quote
                content: 'string',
                level: 'number', // For headings
                language: 'string', // For code blocks
                order: 'number'
              }
            ],
            
            // SEO and metadata
            seo: {
              metaTitle: 'string',
              metaDescription: 'string',
              keywords: ['string'],
              canonicalUrl: 'string',
              openGraphImage: 'string',
              
              // Schema.org structured data
              structuredData: 'object'
            },
            
            // Content settings
            formatting: {
              readingTime: 'number', // Estimated reading time in minutes
              wordCount: 'number',
              language: 'string',
              rtlDirection: 'boolean'
            }
          },
          
          // Publication and status management
          publication: {
            // Status workflow
            status: 'string', // draft, review, published, archived, deleted
            visibility: 'string', // public, private, unlisted, password_protected
            password: 'string', // For password-protected posts
            
            // Publishing timeline
            createdAt: 'date',
            updatedAt: 'date',
            publishedAt: 'date',
            scheduledPublishAt: 'date',
            
            // Revision history (embedded for recent changes)
            revisions: [
              {
                version: 'number',
                changedAt: 'date',
                changedBy: 'ObjectId',
                changeType: 'string', // content, metadata, status
                changesSummary: 'string',
                previousTitle: 'string', // Track major changes
                previousContent: 'string' // Last few versions only
              }
            ],
            
            // Publishing settings
            allowComments: 'boolean',
            allowSharing: 'boolean',
            allowIndexing: 'boolean',
            requireApproval: 'boolean'
          },
          
          // Categorization and tagging (embedded for performance)
          taxonomy: {
            // Categories (hierarchical structure)
            categories: [
              {
                categoryId: 'ObjectId',
                name: 'string',
                slug: 'string',
                level: 'number', // For hierarchical categories
                parentCategory: 'string'
              }
            ],
            
            // Tags (flat structure for flexibility)
            tags: [
              {
                tag: 'string',
                relevanceScore: 'number',
                addedBy: 'ObjectId',
                addedAt: 'date'
              }
            ],
            
            // Custom taxonomies
            customFields: {
              difficulty: 'string', // For tutorials
              estimatedTime: 'number', // For how-to content
              targetAudience: 'string',
              prerequisites: ['string']
            }
          },
          
          // Engagement metrics (denormalized for performance)
          engagement: {
            // View statistics
            views: {
              total: 'number',
              unique: 'number',
              today: 'number',
              thisWeek: 'number',
              thisMonth: 'number',
              
              // View sources
              sources: {
                direct: 'number',
                social: 'number',
                search: 'number',
                referral: 'number'
              }
            },
            
            // Interaction statistics
            interactions: {
              likes: 'number',
              dislikes: 'number',
              shares: 'number',
              bookmarks: 'number',
              
              // Comment statistics
              comments: {
                total: 'number',
                approved: 'number',
                pending: 'number',
                spam: 'number'
              }
            },
            
            // Engagement metrics
            metrics: {
              engagementRate: 'number',
              averageTimeOnPage: 'number',
              bounceRate: 'number',
              socialShares: 'number'
            },
            
            // Top comments (embedded for performance)
            topComments: [
              {
                commentId: 'ObjectId',
                content: 'string',
                author: {
                  userId: 'ObjectId',
                  username: 'string',
                  profilePicture: 'string'
                },
                createdAt: 'date',
                likeCount: 'number',
                isHighlighted: 'boolean'
              }
            ]
          },
          
          // Comments (hybrid approach - recent embedded, full collection referenced)
          comments: {
            // Recent comments embedded for quick access
            recent: [
              {
                commentId: 'ObjectId',
                parentCommentId: 'ObjectId', // For threading
                content: 'string',
                
                // Author information (denormalized)
                author: {
                  userId: 'ObjectId',
                  username: 'string',
                  displayName: 'string',
                  profilePicture: 'string'
                },
                
                // Comment metadata
                createdAt: 'date',
                updatedAt: 'date',
                status: 'string', // approved, pending, spam, deleted
                
                // Comment engagement
                likeCount: 'number',
                replyCount: 'number',
                isEdited: 'boolean',
                isPinned: 'boolean',
                
                // Moderation
                flags: ['string'],
                moderationStatus: 'string'
              }
            ],
            
            // Statistics
            statistics: {
              totalComments: 'number',
              approvedComments: 'number',
              pendingComments: 'number',
              lastCommentAt: 'date'
            }
          },
          
          // Performance optimization data
          performance: {
            // Caching information
            lastCached: 'date',
            cacheVersion: 'string',
            
            // Search optimization
            searchTerms: ['string'], // Extracted keywords for search
            searchBoost: 'number', // Manual search ranking boost
            
            // Content analysis
            sentiment: {
              score: 'number', // -1 to 1
              magnitude: 'number',
              language: 'string'
            },
            
            readabilityScore: 'number',
            complexity: 'string' // simple, moderate, complex
          },
          
          // Flexible metadata
          metadata: {
            customFields: 'object',
            source: 'string', // web, mobile, api
            importedFrom: 'string',
            externalIds: 'object', // For integration with other systems
            
            // A/B testing
            experiments: [
              {
                experimentId: 'string',
                variant: 'string',
                startDate: 'date',
                endDate: 'date'
              }
            ]
          }
        },
        
        // Validation rules for data integrity
        validationRules: {
          required: ['content.title', 'author.userId', 'publication.status'],
          unique: ['slug', 'postId'],
          patterns: {
            slug: /^[a-z0-9-]+$/,
            'content.contentType': /^(article|tutorial|review|announcement|news)$/
          },
          ranges: {
            'content.formatting.readingTime': { min: 0, max: 300 },
            'engagement.metrics.engagementRate': { min: 0, max: 100 }
          }
        },
        
        // Index strategies optimized for content queries
        indexStrategies: [
          { fields: { slug: 1 }, unique: true },
          { fields: { postId: 1 }, unique: true },
          { fields: { 'author.userId': 1, 'publication.publishedAt': -1 } },
          { fields: { 'publication.status': 1, 'publication.publishedAt': -1 } },
          { fields: { 'taxonomy.categories.name': 1 } },
          { fields: { 'taxonomy.tags.tag': 1 } },
          
          // Text search index
          { fields: { 'content.title': 'text', 'content.body': 'text', 'taxonomy.tags.tag': 'text' } },
          
          // Performance optimization indexes
          { fields: { 'engagement.views.total': -1, 'publication.publishedAt': -1 } },
          { fields: { 'publication.visibility': 1, 'engagement.views.total': -1 } },
          { fields: { 'content.contentType': 1, 'publication.publishedAt': -1 } }
        ]
      };
      
      // Store schema definition
      this.documentSchemas.set('posts', postSchema);
      
      console.log('Post schema defined with flexible content structure and performance optimization');
      
    } catch (error) {
      console.error('Error defining post schema:', error);
      throw error;
    }
  }

  async createOptimizedUserProfile(userData, profileData = {}) {
    console.log(`Creating optimized user profile: ${userData.username}`);
    
    try {
      const userDocument = {
        // Core identification
        userId: userData.userId || new ObjectId().toString(),
        username: userData.username,
        email: userData.email,
        
        // Personal information (embedded)
        profile: {
          firstName: profileData.firstName || '',
          lastName: profileData.lastName || '',
          displayName: profileData.displayName || `${profileData.firstName} ${profileData.lastName}`.trim(),
          bio: profileData.bio || '',
          dateOfBirth: profileData.dateOfBirth ? new Date(profileData.dateOfBirth) : null,
          phoneNumber: profileData.phoneNumber || '',
          
          // Professional information
          company: profileData.company || '',
          jobTitle: profileData.jobTitle || '',
          yearsOfExperience: profileData.yearsOfExperience || 0,
          educationLevel: profileData.educationLevel || '',
          
          // Skills and interests
          skills: profileData.skills || [],
          interests: profileData.interests || [],
          languages: profileData.languages || [
            { language: 'English', proficiency: 'native' }
          ],
          
          // Social media links
          socialMedia: {
            facebook: profileData.socialMedia?.facebook || '',
            twitter: profileData.socialMedia?.twitter || '',
            linkedin: profileData.socialMedia?.linkedin || '',
            instagram: profileData.socialMedia?.instagram || '',
            github: profileData.socialMedia?.github || '',
            website: profileData.socialMedia?.website || ''
          },
          
          // Profile media
          profilePicture: profileData.profilePicture ? {
            url: profileData.profilePicture.url,
            thumbnailUrl: profileData.profilePicture.thumbnailUrl || profileData.profilePicture.url,
            uploadedAt: new Date(),
            fileSize: profileData.profilePicture.fileSize || 0,
            dimensions: profileData.profilePicture.dimensions || { width: 0, height: 0 }
          } : null
        },
        
        // Contact information
        contact: {
          addresses: profileData.addresses || [],
          phoneNumbers: profileData.phoneNumbers || [],
          emailAddresses: [
            {
              email: userData.email,
              type: 'primary',
              isVerified: false,
              isPrimary: true
            }
          ]
        },
        
        // Account settings with sensible defaults
        settings: {
          privacy: {
            profileVisibility: 'public',
            emailVisible: false,
            phoneVisible: false,
            searchable: true
          },
          
          notifications: {
            email: {
              posts: true,
              comments: true,
              mentions: true,
              messages: true,
              newsletter: false,
              marketing: false
            },
            push: {
              posts: true,
              comments: true,
              mentions: true,
              messages: true
            },
            sms: {
              security: true,
              important: false
            }
          },
          
          interface: {
            theme: 'light',
            language: 'en',
            timezone: 'UTC',
            dateFormat: 'MM/DD/YYYY',
            currency: 'USD'
          },
          
          content: {
            defaultPostVisibility: 'public',
            autoSaveEnabled: true,
            contentLanguages: ['en']
          }
        },
        
        // Activity tracking
        activity: {
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: new Date(),
          lastActiveAt: new Date(),
          
          status: 'active',
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          
          // Initialize statistics
          stats: {
            totalPosts: 0,
            publishedPosts: 0,
            totalComments: 0,
            totalLikes: 0,
            totalViews: 0,
            followersCount: 0,
            followingCount: 0,
            engagementRate: 0,
            averagePostViews: 0,
            profileCompleteness: this.calculateProfileCompleteness(profileData)
          },
          
          recentActivities: [
            {
              type: 'account_created',
              timestamp: new Date(),
              details: { source: 'registration' }
            }
          ]
        },
        
        // Authentication (placeholder - would be handled by auth system)
        authentication: {
          passwordHash: '', // Would be set by authentication system
          passwordSalt: '',
          lastPasswordChange: new Date(),
          twoFactorEnabled: false,
          activeSessions: [],
          securityEvents: []
        },
        
        // Initialize content relationships
        content: {
          recentPosts: [],
          favoritePostIds: [],
          bookmarks: []
        },
        
        // Initialize social relationships
        social: {
          following: [],
          followerIds: [],
          groups: []
        },
        
        // Metadata
        metadata: {
          customFields: profileData.customFields || {},
          tags: profileData.tags || [],
          categories: profileData.categories || [],
          source: profileData.source || 'direct_registration',
          referrer: profileData.referrer || ''
        }
      };
      
      // Insert user document
      const result = await this.db.collection('users').insertOne(userDocument);
      
      // Update activity statistics
      await this.updateUserStatistics(result.insertedId);
      
      return {
        success: true,
        userId: result.insertedId,
        userDocument: userDocument,
        profileCompleteness: userDocument.activity.stats.profileCompleteness
      };
      
    } catch (error) {
      console.error(`Error creating user profile for ${userData.username}:`, error);
      return {
        success: false,
        error: error.message,
        username: userData.username
      };
    }
  }

  async createOptimizedPost(postData, authorId) {
    console.log(`Creating optimized post: ${postData.title}`);
    
    try {
      // Get author information for denormalization
      const author = await this.db.collection('users').findOne(
        { _id: new ObjectId(authorId) },
        {
          projection: {
            username: 1,
            'profile.displayName': 1,
            'profile.profilePicture.url': 1,
            'activity.stats.totalPosts': 1,
            'activity.stats.followersCount': 1
          }
        }
      );
      
      if (!author) {
        throw new Error('Author not found');
      }
      
      const postDocument = {
        // Core identification
        postId: postData.postId || new ObjectId().toString(),
        slug: postData.slug || this.generateSlug(postData.title),
        
        // Author information (denormalized)
        author: {
          userId: new ObjectId(authorId),
          username: author.username,
          displayName: author.profile?.displayName || author.username,
          profilePicture: author.profile?.profilePicture?.url || '',
          totalPosts: author.activity?.stats?.totalPosts || 0,
          followerCount: author.activity?.stats?.followersCount || 0,
          verified: false // Would be determined by verification system
        },
        
        // Content structure
        content: {
          title: postData.title,
          subtitle: postData.subtitle || '',
          excerpt: postData.excerpt || this.generateExcerpt(postData.body),
          body: postData.body,
          contentType: postData.contentType || 'article',
          
          // Media content
          media: postData.media || [],
          
          // Content sections (for structured content)
          sections: this.parseContentSections(postData.body),
          
          // SEO optimization
          seo: {
            metaTitle: postData.seo?.metaTitle || postData.title,
            metaDescription: postData.seo?.metaDescription || postData.excerpt,
            keywords: postData.seo?.keywords || this.extractKeywords(postData.body),
            canonicalUrl: postData.seo?.canonicalUrl || '',
            openGraphImage: postData.featuredImage || ''
          },
          
          // Content formatting
          formatting: {
            readingTime: this.calculateReadingTime(postData.body),
            wordCount: this.calculateWordCount(postData.body),
            language: postData.language || 'en',
            rtlDirection: postData.rtlDirection || false
          }
        },
        
        // Publication settings
        publication: {
          status: postData.status || 'draft',
          visibility: postData.visibility || 'public',
          password: postData.password || '',
          
          createdAt: new Date(),
          updatedAt: new Date(),
          publishedAt: postData.status === 'published' ? new Date() : null,
          scheduledPublishAt: postData.scheduledPublishAt ? new Date(postData.scheduledPublishAt) : null,
          
          revisions: [
            {
              version: 1,
              changedAt: new Date(),
              changedBy: new ObjectId(authorId),
              changeType: 'content',
              changesSummary: 'Initial post creation'
            }
          ],
          
          allowComments: postData.allowComments !== false,
          allowSharing: postData.allowSharing !== false,
          allowIndexing: postData.allowIndexing !== false,
          requireApproval: postData.requireApproval || false
        },
        
        // Taxonomy
        taxonomy: {
          categories: (postData.categories || []).map(cat => ({
            categoryId: new ObjectId(),
            name: cat.name || cat,
            slug: this.generateSlug(cat.name || cat),
            level: cat.level || 1,
            parentCategory: cat.parent || ''
          })),
          
          tags: (postData.tags || []).map(tag => ({
            tag: typeof tag === 'string' ? tag : tag.name,
            relevanceScore: typeof tag === 'object' ? tag.relevance : 1.0,
            addedBy: new ObjectId(authorId),
            addedAt: new Date()
          })),
          
          customFields: postData.customFields || {}
        },
        
        // Initialize engagement metrics
        engagement: {
          views: {
            total: 0,
            unique: 0,
            today: 0,
            thisWeek: 0,
            thisMonth: 0,
            sources: {
              direct: 0,
              social: 0,
              search: 0,
              referral: 0
            }
          },
          
          interactions: {
            likes: 0,
            dislikes: 0,
            shares: 0,
            bookmarks: 0,
            comments: {
              total: 0,
              approved: 0,
              pending: 0,
              spam: 0
            }
          },
          
          metrics: {
            engagementRate: 0,
            averageTimeOnPage: 0,
            bounceRate: 0,
            socialShares: 0
          },
          
          topComments: []
        },
        
        // Initialize comments
        comments: {
          recent: [],
          statistics: {
            totalComments: 0,
            approvedComments: 0,
            pendingComments: 0,
            lastCommentAt: null
          }
        },
        
        // Performance data
        performance: {
          lastCached: null,
          cacheVersion: '1.0',
          searchTerms: this.extractSearchTerms(postData.title, postData.body),
          searchBoost: postData.searchBoost || 1.0,
          sentiment: this.analyzeSentiment(postData.body),
          readabilityScore: this.calculateReadabilityScore(postData.body),
          complexity: this.assessComplexity(postData.body)
        },
        
        // Metadata
        metadata: {
          customFields: postData.metadata || {},
          source: postData.source || 'web',
          importedFrom: postData.importedFrom || '',
          externalIds: postData.externalIds || {},
          experiments: postData.experiments || []
        }
      };
      
      // Insert post document
      const result = await this.db.collection('posts').insertOne(postDocument);
      
      // Update author statistics
      await this.updateAuthorStatistics(authorId, 'post_created');
      
      // Update user's recent posts
      await this.updateUserRecentPosts(authorId, result.insertedId, postDocument);
      
      return {
        success: true,
        postId: result.insertedId,
        postDocument: postDocument,
        readingTime: postDocument.content.formatting.readingTime,
        wordCount: postDocument.content.formatting.wordCount
      };
      
    } catch (error) {
      console.error(`Error creating post '${postData.title}':`, error);
      return {
        success: false,
        error: error.message,
        title: postData.title
      };
    }
  }

  async performAdvancedQuery(queryOptions) {
    console.log('Executing advanced MongoDB query with optimized document structure...');
    
    try {
      const {
        collection,
        filters = {},
        projection = {},
        sort = {},
        limit = 50,
        skip = 0,
        includeRelated = false
      } = queryOptions;
      
      // Build aggregation pipeline for complex queries
      const pipeline = [];
      
      // Match stage
      if (Object.keys(filters).length > 0) {
        pipeline.push({ $match: filters });
      }
      
      // Add related data if requested
      if (includeRelated && collection === 'posts') {
        pipeline.push(
          // Add full comment documents for recent comments
          {
            $lookup: {
              from: 'comments',
              localField: '_id',
              foreignField: 'postId',
              as: 'fullComments',
              pipeline: [
                { $match: { status: 'approved' } },
                { $sort: { createdAt: -1 } },
                { $limit: 10 }
              ]
            }
          },
          
          // Add author's full profile
          {
            $lookup: {
              from: 'users',
              localField: 'author.userId',
              foreignField: '_id',
              as: 'authorProfile',
              pipeline: [
                {
                  $project: {
                    username: 1,
                    'profile.displayName': 1,
                    'profile.bio': 1,
                    'profile.profilePicture': 1,
                    'activity.stats': 1
                  }
                }
              ]
            }
          }
        );
      }
      
      // Projection stage
      if (Object.keys(projection).length > 0) {
        pipeline.push({ $project: projection });
      }
      
      // Sort stage
      if (Object.keys(sort).length > 0) {
        pipeline.push({ $sort: sort });
      }
      
      // Pagination
      if (skip > 0) {
        pipeline.push({ $skip: skip });
      }
      
      if (limit > 0) {
        pipeline.push({ $limit: limit });
      }
      
      // Execute aggregation
      const results = await this.db.collection(collection).aggregate(pipeline).toArray();
      
      return {
        success: true,
        results: results,
        count: results.length,
        pipeline: pipeline
      };
      
    } catch (error) {
      console.error('Error executing advanced query:', error);
      return {
        success: false,
        error: error.message,
        queryOptions: queryOptions
      };
    }
  }

  // Utility methods for document processing and optimization

  calculateProfileCompleteness(profileData) {
    let score = 0;
    const maxScore = 100;
    
    // Basic information (40 points)
    if (profileData.firstName) score += 10;
    if (profileData.lastName) score += 10;
    if (profileData.bio) score += 10;
    if (profileData.profilePicture) score += 10;
    
    // Professional information (30 points)
    if (profileData.company) score += 10;
    if (profileData.jobTitle) score += 10;
    if (profileData.skills && profileData.skills.length > 0) score += 10;
    
    // Contact information (20 points)
    if (profileData.phoneNumber) score += 10;
    if (profileData.addresses && profileData.addresses.length > 0) score += 10;
    
    // Additional information (10 points)
    if (profileData.socialMedia && Object.values(profileData.socialMedia).some(url => url)) score += 10;
    
    return Math.min(score, maxScore);
  }

  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }

  generateExcerpt(body, maxLength = 200) {
    const text = body.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  calculateReadingTime(text) {
    const wordsPerMinute = 200;
    const wordCount = this.calculateWordCount(text);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  calculateWordCount(text) {
    const cleanText = text.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
    return cleanText.split(/\s+/).filter(word => word.length > 0).length;
  }

  extractKeywords(text, maxKeywords = 10) {
    // Simple keyword extraction - in production, use NLP libraries
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const frequency = {};
    
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxKeywords)
      .map(([word]) => word);
  }

  extractSearchTerms(title, body) {
    const titleWords = title.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const bodyWords = this.extractKeywords(body, 20);
    return [...new Set([...titleWords, ...bodyWords])];
  }

  parseContentSections(body) {
    // Simple section parsing - would be more sophisticated in production
    const sections = [];
    const lines = body.split('\n');
    let order = 0;
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        const level = trimmed.match(/^#+/)[0].length;
        sections.push({
          type: 'heading',
          content: trimmed.replace(/^#+\s*/, ''),
          level: level,
          order: order++
        });
      } else if (trimmed.startsWith('```')) {
        sections.push({
          type: 'code',
          content: trimmed.replace(/```(\w+)?/, ''),
          language: trimmed.match(/```(\w+)/)?.[1] || 'text',
          order: order++
        });
      } else if (trimmed.length > 0) {
        sections.push({
          type: 'paragraph',
          content: trimmed,
          order: order++
        });
      }
    });
    
    return sections;
  }

  analyzeSentiment(text) {
    // Placeholder sentiment analysis - use proper NLP library in production
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing'];
    
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;
    
    words.forEach(word => {
      if (positiveWords.includes(word)) score += 0.1;
      if (negativeWords.includes(word)) score -= 0.1;
    });
    
    return {
      score: Math.max(-1, Math.min(1, score)),
      magnitude: Math.abs(score),
      language: 'en'
    };
  }

  calculateReadabilityScore(text) {
    // Simple readability calculation - use proper libraries in production
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/);
    const avgWordsPerSentence = words.length / sentences.length;
    
    // Simple scoring based on average sentence length
    if (avgWordsPerSentence < 15) return 90;
    if (avgWordsPerSentence < 20) return 70;
    if (avgWordsPerSentence < 25) return 50;
    return 30;
  }

  assessComplexity(text) {
    const wordCount = this.calculateWordCount(text);
    const readabilityScore = this.calculateReadabilityScore(text);
    
    if (wordCount < 500 && readabilityScore > 70) return 'simple';
    if (wordCount < 2000 && readabilityScore > 50) return 'moderate';
    return 'complex';
  }

  async updateUserStatistics(userId) {
    // Update user statistics after profile changes
    await this.db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          'activity.updatedAt': new Date()
        }
      }
    );
  }

  async updateAuthorStatistics(authorId, action) {
    const updates = {};
    
    if (action === 'post_created') {
      updates['$inc'] = {
        'activity.stats.totalPosts': 1
      };
    }
    
    updates['$set'] = {
      'activity.updatedAt': new Date(),
      'activity.lastActiveAt': new Date()
    };
    
    await this.db.collection('users').updateOne(
      { _id: new ObjectId(authorId) },
      updates
    );
  }

  async updateUserRecentPosts(userId, postId, postDocument) {
    await this.db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      {
        $push: {
          'content.recentPosts': {
            $each: [
              {
                postId: postId,
                title: postDocument.content.title,
                createdAt: postDocument.publication.createdAt,
                status: postDocument.publication.status,
                viewCount: 0,
                likeCount: 0
              }
            ],
            $slice: -10 // Keep only the 10 most recent posts
          }
        }
      }
    );
  }

  async setupOptimizedIndexes() {
    console.log('Setting up optimized indexes for document collections...');
    
    try {
      // Apply indexes from schema definitions
      for (const [collectionName, schema] of this.documentSchemas.entries()) {
        const collection = this.db.collection(collectionName);
        
        for (const indexStrategy of schema.indexStrategies) {
          await collection.createIndex(indexStrategy.fields, {
            background: true,
            unique: indexStrategy.unique || false,
            sparse: indexStrategy.sparse || false,
            partialFilterExpression: indexStrategy.partialFilterExpression
          });
        }
      }
      
      console.log('Optimized indexes created successfully');
      
    } catch (error) {
      console.error('Error setting up optimized indexes:', error);
      throw error;
    }
  }

  async applySchemaValidation() {
    console.log('Applying schema validation rules...');
    
    try {
      // Apply validation for users collection
      await this.db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['username', 'email'],
            properties: {
              username: {
                bsonType: 'string',
                pattern: '^[a-zA-Z0-9_]{3,30}$',
                description: 'Username must be 3-30 characters with only letters, numbers, and underscores'
              },
              email: {
                bsonType: 'string',
                pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
                description: 'Valid email address required'
              },
              'profile.yearsOfExperience': {
                bsonType: 'int',
                minimum: 0,
                maximum: 70,
                description: 'Years of experience must be between 0 and 70'
              }
            }
          }
        },
        validationLevel: this.config.validationLevel,
        validationAction: this.config.strictValidation ? 'error' : 'warn'
      });
      
      // Apply validation for posts collection
      await this.db.createCollection('posts', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['content.title', 'author.userId'],
            properties: {
              'content.title': {
                bsonType: 'string',
                minLength: 1,
                maxLength: 500,
                description: 'Post title is required and must be 1-500 characters'
              },
              'content.contentType': {
                bsonType: 'string',
                'enum': ['article', 'tutorial', 'review', 'announcement', 'news'],
                description: 'Content type must be one of the predefined values'
              },
              'publication.status': {
                bsonType: 'string',
                'enum': ['draft', 'review', 'published', 'archived', 'deleted'],
                description: 'Publication status must be one of the predefined values'
              }
            }
          }
        },
        validationLevel: this.config.validationLevel,
        validationAction: this.config.strictValidation ? 'error' : 'warn'
      });
      
      console.log('Schema validation rules applied successfully');
      
    } catch (error) {
      // Collections might already exist, which is fine
      if (!error.message.includes('already exists')) {
        console.error('Error applying schema validation:', error);
        throw error;
      }
    }
  }
}

// Benefits of MongoDB Advanced Data Modeling:
// - Flexible document structures that adapt to application requirements
// - Embedded relationships for optimal read performance and data locality
// - Denormalized data patterns for reduced join operations and improved query speed
// - Hierarchical data modeling with natural document nesting capabilities
// - Schema evolution support without complex migration procedures
// - Optimized indexing strategies for diverse query patterns
// - Rich data types including arrays, objects, and geospatial data
// - Query pattern optimization through strategic embedding and referencing
// - SQL-compatible operations through QueryLeaf integration
// - Production-ready data modeling patterns for scalable applications

module.exports = {
  AdvancedDataModelingManager
};
```

## Understanding MongoDB Document Architecture

### Advanced Schema Design and Relationship Optimization Patterns

Implement sophisticated data modeling workflows for enterprise MongoDB applications:

```javascript
// Enterprise-grade data modeling with advanced relationship management capabilities
class EnterpriseDataModelingOrchestrator extends AdvancedDataModelingManager {
  constructor(mongoUri, enterpriseConfig) {
    super(mongoUri, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      enableAdvancedRelationships: true,
      enableDataGovernance: true,
      enablePerformanceOptimization: true,
      enableComplianceValidation: true,
      enableSchemaEvolution: true
    };
    
    this.setupEnterpriseCapabilities();
    this.initializeDataGovernance();
    this.setupAdvancedRelationshipManagement();
  }

  async implementAdvancedDataStrategy() {
    console.log('Implementing enterprise data modeling strategy...');
    
    const dataStrategy = {
      // Multi-tier data organization
      dataTiers: {
        operationalData: {
          embedding: 'aggressive',
          caching: 'memory',
          indexing: 'comprehensive',
          validation: 'strict'
        },
        analyticalData: {
          embedding: 'conservative',
          caching: 'disk',
          indexing: 'selective',
          validation: 'moderate'
        },
        archivalData: {
          embedding: 'minimal',
          caching: 'none',
          indexing: 'basic',
          validation: 'basic'
        }
      },
      
      // Advanced relationship management
      relationshipManagement: {
        dynamicReferencing: true,
        cascadingOperations: true,
        relationshipIndexing: true,
        crossCollectionValidation: true
      }
    };

    return await this.deployDataStrategy(dataStrategy);
  }

  async setupAdvancedDataGovernance() {
    console.log('Setting up enterprise data governance...');
    
    const governanceCapabilities = {
      // Data quality management
      dataQuality: {
        validationRules: true,
        dataCleansingPipelines: true,
        qualityMonitoring: true,
        anomalyDetection: true
      },
      
      // Compliance and auditing
      compliance: {
        dataLineage: true,
        auditTrails: true,
        privacyControls: true,
        retentionPolicies: true
      },
      
      // Schema governance
      schemaGovernance: {
        versionControl: true,
        changeApproval: true,
        backwardCompatibility: true,
        migrationAutomation: true
      }
    };

    return await this.deployDataGovernance(governanceCapabilities);
  }
}
```

## SQL-Style Data Modeling with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB data modeling and schema operations:

```sql
-- QueryLeaf advanced data modeling operations with SQL-familiar syntax for MongoDB

-- Create comprehensive user profile schema with embedded relationships
CREATE DOCUMENT_SCHEMA user_profiles AS (
  -- Core identification
  user_id VARCHAR(24) PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  
  -- Embedded personal information
  profile OBJECT(
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(200),
    bio TEXT,
    date_of_birth DATE,
    phone_number VARCHAR(20),
    
    -- Professional information (embedded object)
    professional OBJECT(
      company VARCHAR(255),
      job_title VARCHAR(255),
      years_experience INTEGER CHECK(years_experience >= 0 AND years_experience <= 70),
      education_level VARCHAR(100),
      skills ARRAY[VARCHAR(100)],
      languages ARRAY[OBJECT(
        language VARCHAR(50),
        proficiency VARCHAR(20) CHECK(proficiency IN ('beginner', 'intermediate', 'advanced', 'native'))
      )]
    ),
    
    -- Social media links (embedded object)
    social_media OBJECT(
      facebook VARCHAR(255),
      twitter VARCHAR(255),
      linkedin VARCHAR(255),
      instagram VARCHAR(255),
      github VARCHAR(255),
      website VARCHAR(255)
    ),
    
    -- Profile media (embedded object)
    profile_picture OBJECT(
      url VARCHAR(500),
      thumbnail_url VARCHAR(500),
      uploaded_at TIMESTAMP,
      file_size INTEGER,
      dimensions OBJECT(
        width INTEGER,
        height INTEGER
      )
    )
  ),
  
  -- Contact information (embedded array)
  contact OBJECT(
    addresses ARRAY[OBJECT(
      type VARCHAR(20) CHECK(type IN ('home', 'work', 'billing', 'shipping')),
      address_line_1 VARCHAR(255),
      address_line_2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      postal_code VARCHAR(20),
      country VARCHAR(100),
      is_primary BOOLEAN DEFAULT false,
      coordinates OBJECT(
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7)
      )
    )],
    
    phone_numbers ARRAY[OBJECT(
      type VARCHAR(20) CHECK(type IN ('mobile', 'home', 'work')),
      number VARCHAR(20),
      country_code VARCHAR(5),
      is_primary BOOLEAN DEFAULT false,
      is_verified BOOLEAN DEFAULT false
    )],
    
    email_addresses ARRAY[OBJECT(
      email VARCHAR(255),
      type VARCHAR(20) CHECK(type IN ('primary', 'work', 'personal')),
      is_verified BOOLEAN DEFAULT false,
      is_primary BOOLEAN DEFAULT false
    )]
  ),
  
  -- User settings (embedded object)
  settings OBJECT(
    privacy OBJECT(
      profile_visibility VARCHAR(20) CHECK(profile_visibility IN ('public', 'private', 'friends')) DEFAULT 'public',
      email_visible BOOLEAN DEFAULT false,
      phone_visible BOOLEAN DEFAULT false,
      searchable BOOLEAN DEFAULT true
    ),
    
    notifications OBJECT(
      email OBJECT(
        posts BOOLEAN DEFAULT true,
        comments BOOLEAN DEFAULT true,
        mentions BOOLEAN DEFAULT true,
        messages BOOLEAN DEFAULT true,
        newsletter BOOLEAN DEFAULT false,
        marketing BOOLEAN DEFAULT false
      ),
      push OBJECT(
        posts BOOLEAN DEFAULT true,
        comments BOOLEAN DEFAULT true,
        mentions BOOLEAN DEFAULT true,
        messages BOOLEAN DEFAULT true
      ),
      sms OBJECT(
        security BOOLEAN DEFAULT true,
        important BOOLEAN DEFAULT false
      )
    ),
    
    interface OBJECT(
      theme VARCHAR(20) CHECK(theme IN ('light', 'dark', 'auto')) DEFAULT 'light',
      language VARCHAR(10) DEFAULT 'en',
      timezone VARCHAR(50) DEFAULT 'UTC',
      date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY',
      currency VARCHAR(3) DEFAULT 'USD'
    )
  ),
  
  -- Activity tracking (embedded object)
  activity OBJECT(
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    last_active_at TIMESTAMP,
    
    status VARCHAR(20) CHECK(status IN ('active', 'inactive', 'suspended', 'deleted')) DEFAULT 'active',
    email_verified_at TIMESTAMP,
    phone_verified_at TIMESTAMP,
    
    -- Denormalized statistics for performance
    stats OBJECT(
      total_posts INTEGER DEFAULT 0,
      published_posts INTEGER DEFAULT 0,
      total_comments INTEGER DEFAULT 0,
      total_likes INTEGER DEFAULT 0,
      total_views INTEGER DEFAULT 0,
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      engagement_rate DECIMAL(5,2) DEFAULT 0.0,
      average_post_views DECIMAL(10,2) DEFAULT 0.0,
      profile_completeness DECIMAL(5,2) DEFAULT 0.0
    ),
    
    -- Recent activities (embedded array with limited size)
    recent_activities ARRAY[OBJECT(
      type VARCHAR(50),
      timestamp TIMESTAMP,
      details OBJECT,
      ip_address VARCHAR(45),
      user_agent VARCHAR(500)
    )] -- Limited to last 50 activities
  ),
  
  -- Content relationships (selective embedding/referencing)
  content OBJECT(
    -- Recent posts embedded for performance
    recent_posts ARRAY[OBJECT(
      post_id VARCHAR(24),
      title VARCHAR(500),
      created_at TIMESTAMP,
      status VARCHAR(20),
      view_count INTEGER,
      like_count INTEGER
    )] -- Limited to last 10 posts
    
    -- Large collections referenced
    favorite_post_ids ARRAY[VARCHAR(24)],
    
    -- Bookmarks with metadata
    bookmarks ARRAY[OBJECT(
      content_id VARCHAR(24),
      content_type VARCHAR(20) CHECK(content_type IN ('post', 'comment', 'user')),
      bookmarked_at TIMESTAMP,
      tags ARRAY[VARCHAR(50)],
      notes TEXT
    )]
  ),
  
  -- Social relationships (hybrid approach)
  social OBJECT(
    -- Following relationships (embedded for moderate size)
    following ARRAY[OBJECT(
      user_id VARCHAR(24),
      username VARCHAR(255),
      followed_at TIMESTAMP,
      relationship_type VARCHAR(20) CHECK(relationship_type IN ('friend', 'colleague', 'interest'))
    )],
    
    -- Large follower lists referenced
    follower_ids ARRAY[VARCHAR(24)],
    
    -- Group memberships
    groups ARRAY[OBJECT(
      group_id VARCHAR(24),
      group_name VARCHAR(255),
      role VARCHAR(20) CHECK(role IN ('member', 'moderator', 'admin')),
      joined_at TIMESTAMP
    )]
  ),
  
  -- Flexible metadata for extensibility
  metadata OBJECT(
    custom_fields OBJECT,
    tags ARRAY[VARCHAR(50)],
    categories ARRAY[VARCHAR(50)],
    source VARCHAR(100),
    referrer VARCHAR(255)
  ),
  
  -- Indexes for optimal performance
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_status_last_active (activity.status, activity.last_active_at DESC),
  INDEX idx_skills (profile.professional.skills),
  INDEX idx_location (contact.addresses.city, contact.addresses.state),
  
  -- Text search index
  INDEX idx_text_search ON (
    username TEXT,
    profile.display_name TEXT,
    profile.bio TEXT,
    profile.professional.skills TEXT
  ),
  
  -- Compound indexes for common query patterns
  INDEX idx_visibility_stats (settings.privacy.profile_visibility, activity.stats.total_posts DESC),
  INDEX idx_company_role (profile.professional.company, profile.professional.job_title)
);

-- Advanced post schema with flexible content structure
CREATE DOCUMENT_SCHEMA content_posts AS (
  -- Core identification
  post_id VARCHAR(24) PRIMARY KEY,
  slug VARCHAR(500) UNIQUE NOT NULL,
  
  -- Author information (denormalized for performance)
  author OBJECT(
    user_id VARCHAR(24) NOT NULL,
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(200),
    profile_picture VARCHAR(500),
    total_posts INTEGER,
    follower_count INTEGER,
    verified BOOLEAN DEFAULT false
  ),
  
  -- Flexible content structure
  content OBJECT(
    title VARCHAR(500) NOT NULL,
    subtitle VARCHAR(500),
    excerpt TEXT,
    body TEXT NOT NULL,
    content_type VARCHAR(20) CHECK(content_type IN ('article', 'tutorial', 'review', 'announcement', 'news')) DEFAULT 'article',
    
    -- Rich media content
    media ARRAY[OBJECT(
      type VARCHAR(20) CHECK(type IN ('image', 'video', 'audio', 'embed')),
      url VARCHAR(1000),
      thumbnail_url VARCHAR(1000),
      caption TEXT,
      alt_text TEXT,
      dimensions OBJECT(
        width INTEGER,
        height INTEGER
      ),
      file_size INTEGER,
      mime_type VARCHAR(100),
      duration INTEGER, -- For video/audio
      uploaded_at TIMESTAMP
    )],
    
    -- Structured content sections
    sections ARRAY[OBJECT(
      type VARCHAR(20) CHECK(type IN ('paragraph', 'heading', 'list', 'code', 'quote')),
      content TEXT,
      level INTEGER, -- For headings
      language VARCHAR(20), -- For code blocks
      order_index INTEGER
    )],
    
    -- SEO and metadata
    seo OBJECT(
      meta_title VARCHAR(500),
      meta_description TEXT,
      keywords ARRAY[VARCHAR(100)],
      canonical_url VARCHAR(1000),
      open_graph_image VARCHAR(1000),
      structured_data OBJECT
    ),
    
    -- Content analysis
    formatting OBJECT(
      reading_time INTEGER, -- Minutes
      word_count INTEGER,
      language VARCHAR(10) DEFAULT 'en',
      rtl_direction BOOLEAN DEFAULT false
    )
  ),
  
  -- Publication management
  publication OBJECT(
    status VARCHAR(20) CHECK(status IN ('draft', 'review', 'published', 'archived', 'deleted')) DEFAULT 'draft',
    visibility VARCHAR(20) CHECK(visibility IN ('public', 'private', 'unlisted', 'password_protected')) DEFAULT 'public',
    password VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    scheduled_publish_at TIMESTAMP,
    
    -- Revision tracking (limited to recent changes)
    revisions ARRAY[OBJECT(
      version INTEGER,
      changed_at TIMESTAMP,
      changed_by VARCHAR(24),
      change_type VARCHAR(20) CHECK(change_type IN ('content', 'metadata', 'status')),
      changes_summary TEXT,
      previous_title VARCHAR(500),
      previous_content TEXT
    )] -- Limited to last 10 revisions
    
    allow_comments BOOLEAN DEFAULT true,
    allow_sharing BOOLEAN DEFAULT true,
    allow_indexing BOOLEAN DEFAULT true,
    require_approval BOOLEAN DEFAULT false
  ),
  
  -- Categorization and tagging
  taxonomy OBJECT(
    categories ARRAY[OBJECT(
      category_id VARCHAR(24),
      name VARCHAR(255),
      slug VARCHAR(255),
      level INTEGER,
      parent_category VARCHAR(255)
    )],
    
    tags ARRAY[OBJECT(
      tag VARCHAR(100),
      relevance_score DECIMAL(3,2) DEFAULT 1.0,
      added_by VARCHAR(24),
      added_at TIMESTAMP
    )],
    
    custom_fields OBJECT(
      difficulty VARCHAR(20), -- For tutorials
      estimated_time INTEGER, -- For how-to content
      target_audience VARCHAR(100),
      prerequisites ARRAY[VARCHAR(100)]
    )
  ),
  
  -- Engagement metrics (denormalized for performance)
  engagement OBJECT(
    views OBJECT(
      total INTEGER DEFAULT 0,
      unique INTEGER DEFAULT 0,
      today INTEGER DEFAULT 0,
      this_week INTEGER DEFAULT 0,
      this_month INTEGER DEFAULT 0,
      sources OBJECT(
        direct INTEGER DEFAULT 0,
        social INTEGER DEFAULT 0,
        search INTEGER DEFAULT 0,
        referral INTEGER DEFAULT 0
      )
    ),
    
    interactions OBJECT(
      likes INTEGER DEFAULT 0,
      dislikes INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      bookmarks INTEGER DEFAULT 0,
      comments OBJECT(
        total INTEGER DEFAULT 0,
        approved INTEGER DEFAULT 0,
        pending INTEGER DEFAULT 0,
        spam INTEGER DEFAULT 0
      )
    ),
    
    metrics OBJECT(
      engagement_rate DECIMAL(5,2) DEFAULT 0.0,
      average_time_on_page INTEGER DEFAULT 0, -- Seconds
      bounce_rate DECIMAL(5,2) DEFAULT 0.0,
      social_shares INTEGER DEFAULT 0
    ),
    
    -- Top comments embedded for quick access
    top_comments ARRAY[OBJECT(
      comment_id VARCHAR(24),
      content TEXT,
      author OBJECT(
        user_id VARCHAR(24),
        username VARCHAR(255),
        profile_picture VARCHAR(500)
      ),
      created_at TIMESTAMP,
      like_count INTEGER,
      is_highlighted BOOLEAN DEFAULT false
    )] -- Limited to top 5 comments
  ),
  
  -- Comment management (hybrid approach)
  comments OBJECT(
    -- Recent comments embedded
    recent ARRAY[OBJECT(
      comment_id VARCHAR(24),
      parent_comment_id VARCHAR(24),
      content TEXT,
      author OBJECT(
        user_id VARCHAR(24),
        username VARCHAR(255),
        display_name VARCHAR(200),
        profile_picture VARCHAR(500)
      ),
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      status VARCHAR(20) CHECK(status IN ('approved', 'pending', 'spam', 'deleted')) DEFAULT 'approved',
      like_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      is_edited BOOLEAN DEFAULT false,
      is_pinned BOOLEAN DEFAULT false,
      flags ARRAY[VARCHAR(50)],
      moderation_status VARCHAR(20)
    )] -- Limited to last 20 comments
    
    statistics OBJECT(
      total_comments INTEGER DEFAULT 0,
      approved_comments INTEGER DEFAULT 0,
      pending_comments INTEGER DEFAULT 0,
      last_comment_at TIMESTAMP
    )
  ),
  
  -- Performance optimization
  performance OBJECT(
    last_cached TIMESTAMP,
    cache_version VARCHAR(10),
    search_terms ARRAY[VARCHAR(100)],
    search_boost DECIMAL(3,2) DEFAULT 1.0,
    
    sentiment OBJECT(
      score DECIMAL(3,2), -- -1 to 1
      magnitude DECIMAL(3,2),
      language VARCHAR(10)
    ),
    
    readability_score INTEGER,
    complexity VARCHAR(20) CHECK(complexity IN ('simple', 'moderate', 'complex'))
  ),
  
  -- Flexible metadata
  metadata OBJECT(
    custom_fields OBJECT,
    source VARCHAR(50) DEFAULT 'web',
    imported_from VARCHAR(100),
    external_ids OBJECT,
    
    experiments ARRAY[OBJECT(
      experiment_id VARCHAR(50),
      variant VARCHAR(50),
      start_date DATE,
      end_date DATE
    )]
  ),
  
  -- Optimized indexes for content queries
  INDEX idx_slug (slug),
  INDEX idx_author_published (author.user_id, publication.published_at DESC),
  INDEX idx_status_published (publication.status, publication.published_at DESC),
  INDEX idx_categories (taxonomy.categories.name),
  INDEX idx_tags (taxonomy.tags.tag),
  INDEX idx_engagement (engagement.views.total DESC, publication.published_at DESC),
  
  -- Text search index for content
  INDEX idx_content_search ON (
    content.title TEXT,
    content.body TEXT,
    taxonomy.tags.tag TEXT,
    taxonomy.categories.name TEXT
  ),
  
  -- Compound indexes for complex queries
  INDEX idx_visibility_engagement (publication.visibility, engagement.views.total DESC),
  INDEX idx_type_published (content.content_type, publication.published_at DESC),
  INDEX idx_author_stats (author.user_id, engagement.interactions.likes DESC)
);

-- Advanced data modeling analysis and optimization queries
WITH document_structure_analysis AS (
  SELECT 
    collection_name,
    COUNT(*) as total_documents,
    
    -- Document size analysis
    AVG(BSON_SIZE(document)) as avg_document_size_bytes,
    MAX(BSON_SIZE(document)) as max_document_size_bytes,
    MIN(BSON_SIZE(document)) as min_document_size_bytes,
    
    -- Embedded array analysis
    AVG(ARRAY_LENGTH(profile.professional.skills)) as avg_skills_count,
    AVG(ARRAY_LENGTH(contact.addresses)) as avg_addresses_count,
    AVG(ARRAY_LENGTH(social.following)) as avg_following_count,
    
    -- Nested object complexity
    AVG(OBJECT_DEPTH(profile)) as avg_profile_depth,
    AVG(OBJECT_DEPTH(settings)) as avg_settings_depth,
    AVG(OBJECT_DEPTH(activity)) as avg_activity_depth,
    
    -- Data completeness analysis
    COUNT(*) FILTER (WHERE profile.first_name IS NOT NULL) as profiles_with_first_name,
    COUNT(*) FILTER (WHERE profile.bio IS NOT NULL) as profiles_with_bio,
    COUNT(*) FILTER (WHERE profile.professional.company IS NOT NULL) as profiles_with_company,
    COUNT(*) FILTER (WHERE contact.addresses IS NOT NULL AND ARRAY_LENGTH(contact.addresses) > 0) as profiles_with_address,
    
    -- Activity patterns
    AVG(activity.stats.total_posts) as avg_posts_per_user,
    AVG(activity.stats.profile_completeness) as avg_profile_completeness,
    
    -- Relationship analysis
    AVG(ARRAY_LENGTH(content.favorite_post_ids)) as avg_favorites_per_user,
    AVG(ARRAY_LENGTH(social.follower_ids)) as avg_followers_per_user
    
  FROM USER_PROFILES
  GROUP BY collection_name
),

performance_optimization_analysis AS (
  SELECT 
    dsa.*,
    
    -- Document size categorization
    CASE 
      WHEN dsa.avg_document_size_bytes < 16384 THEN 'optimal_size' -- < 16KB
      WHEN dsa.avg_document_size_bytes < 65536 THEN 'good_size'     -- < 64KB
      WHEN dsa.avg_document_size_bytes < 262144 THEN 'large_size'   -- < 256KB
      ELSE 'very_large_size'                                        -- >= 256KB
    END as document_size_category,
    
    -- Embedding effectiveness
    CASE 
      WHEN dsa.avg_skills_count > 20 THEN 'consider_referencing_skills'
      WHEN dsa.avg_following_count > 1000 THEN 'consider_referencing_following'
      WHEN dsa.avg_addresses_count > 5 THEN 'consider_referencing_addresses'
      ELSE 'embedding_appropriate'
    END as embedding_recommendation,
    
    -- Data completeness scoring
    ROUND(
      (dsa.profiles_with_first_name * 100.0 / dsa.total_documents + 
       dsa.profiles_with_bio * 100.0 / dsa.total_documents + 
       dsa.profiles_with_company * 100.0 / dsa.total_documents + 
       dsa.profiles_with_address * 100.0 / dsa.total_documents) / 4, 
      2
    ) as overall_data_completeness_percent,
    
    -- Performance indicators
    CASE 
      WHEN dsa.avg_profile_depth > 4 THEN 'consider_flattening_structure'
      WHEN dsa.max_document_size_bytes > 1048576 THEN 'critical_size_optimization_needed' -- > 1MB
      WHEN dsa.avg_followers_per_user > 10000 THEN 'implement_follower_pagination'
      ELSE 'structure_optimized'
    END as structure_optimization_recommendation,
    
    -- Index strategy recommendations
    ARRAY[
      CASE WHEN dsa.profiles_with_company * 100.0 / dsa.total_documents > 60 
           THEN 'Add index on profile.professional.company' END,
      CASE WHEN dsa.avg_skills_count > 3 
           THEN 'Optimize skills array indexing' END,
      CASE WHEN dsa.profiles_with_address * 100.0 / dsa.total_documents > 70 
           THEN 'Add geospatial index for addresses' END,
      CASE WHEN dsa.avg_posts_per_user > 50 
           THEN 'Consider post relationship optimization' END
    ]::TEXT[] as indexing_recommendations
    
  FROM document_structure_analysis dsa
),

content_modeling_analysis AS (
  SELECT 
    'content_posts' as collection_name,
    COUNT(*) as total_posts,
    
    -- Content structure analysis
    AVG(BSON_SIZE(content)) as avg_content_size_bytes,
    AVG(content.formatting.word_count) as avg_word_count,
    AVG(content.formatting.reading_time) as avg_reading_time_minutes,
    AVG(ARRAY_LENGTH(content.media)) as avg_media_items,
    
    -- Taxonomy analysis
    AVG(ARRAY_LENGTH(taxonomy.categories)) as avg_categories_per_post,
    AVG(ARRAY_LENGTH(taxonomy.tags)) as avg_tags_per_post,
    
    -- Engagement patterns
    AVG(engagement.views.total) as avg_total_views,
    AVG(engagement.interactions.likes) as avg_likes,
    AVG(engagement.interactions.comments.total) as avg_comments,
    
    -- Comment embedding analysis
    AVG(ARRAY_LENGTH(comments.recent)) as avg_embedded_comments,
    MAX(ARRAY_LENGTH(comments.recent)) as max_embedded_comments,
    
    -- Content type distribution
    COUNT(*) FILTER (WHERE content.content_type = 'article') as article_count,
    COUNT(*) FILTER (WHERE content.content_type = 'tutorial') as tutorial_count,
    COUNT(*) FILTER (WHERE content.content_type = 'review') as review_count,
    
    -- Publication patterns
    COUNT(*) FILTER (WHERE publication.status = 'published') as published_posts,
    COUNT(*) FILTER (WHERE publication.status = 'draft') as draft_posts,
    
    -- Performance metrics
    AVG(performance.readability_score) as avg_readability_score,
    COUNT(*) FILTER (WHERE performance.complexity = 'simple') as simple_content,
    COUNT(*) FILTER (WHERE performance.complexity = 'moderate') as moderate_content,
    COUNT(*) FILTER (WHERE performance.complexity = 'complex') as complex_content
    
  FROM CONTENT_POSTS
  WHERE publication.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
)

SELECT 
  poa.collection_name,
  poa.total_documents,
  poa.document_size_category,
  
  -- Size metrics
  ROUND(poa.avg_document_size_bytes / 1024.0, 2) as avg_size_kb,
  ROUND(poa.max_document_size_bytes / 1024.0, 2) as max_size_kb,
  
  -- Structure analysis
  ROUND(poa.avg_profile_depth, 1) as avg_nesting_depth,
  poa.embedding_recommendation,
  poa.structure_optimization_recommendation,
  
  -- Data quality
  ROUND(poa.overall_data_completeness_percent, 1) as data_completeness_percent,
  ROUND(poa.avg_profile_completeness, 1) as avg_profile_completeness,
  
  -- Relationship metrics
  ROUND(poa.avg_skills_count, 1) as avg_skills_per_user,
  ROUND(poa.avg_following_count, 1) as avg_following_per_user,
  ROUND(poa.avg_followers_per_user, 1) as avg_followers_per_user,
  
  -- Performance recommendations
  ARRAY_REMOVE(poa.indexing_recommendations, NULL) as optimization_recommendations,
  
  -- Data modeling assessment
  CASE 
    WHEN poa.document_size_category = 'very_large_size' THEN 'critical_optimization_needed'
    WHEN poa.embedding_recommendation != 'embedding_appropriate' THEN 'relationship_optimization_needed'
    WHEN poa.overall_data_completeness_percent < 60 THEN 'data_quality_improvement_needed'
    ELSE 'data_model_optimized'
  END as overall_assessment,
  
  -- Specific action items
  ARRAY[
    CASE WHEN poa.avg_document_size_bytes > 262144 
         THEN 'Split large documents or reference large arrays' END,
    CASE WHEN poa.overall_data_completeness_percent < 50 
         THEN 'Implement data validation and user onboarding improvements' END,
    CASE WHEN poa.avg_followers_per_user > 5000 
         THEN 'Implement follower pagination and lazy loading' END,
    CASE WHEN poa.max_document_size_bytes > 1048576 
         THEN 'URGENT: Address oversized documents immediately' END
  ]::TEXT[] as action_items,
  
  -- Performance impact
  CASE 
    WHEN poa.document_size_category IN ('large_size', 'very_large_size') THEN 'high_performance_impact'
    WHEN poa.embedding_recommendation != 'embedding_appropriate' THEN 'medium_performance_impact'
    ELSE 'low_performance_impact'
  END as performance_impact
  
FROM performance_optimization_analysis poa

UNION ALL

-- Content analysis results
SELECT 
  cma.collection_name,
  cma.total_posts as total_documents,
  
  CASE 
    WHEN cma.avg_content_size_bytes < 32768 THEN 'optimal_size'
    WHEN cma.avg_content_size_bytes < 131072 THEN 'good_size' 
    WHEN cma.avg_content_size_bytes < 524288 THEN 'large_size'
    ELSE 'very_large_size'
  END as document_size_category,
  
  ROUND(cma.avg_content_size_bytes / 1024.0, 2) as avg_size_kb,
  0 as max_size_kb, -- Placeholder for union compatibility
  
  0 as avg_nesting_depth, -- Placeholder
  
  CASE 
    WHEN cma.avg_media_items > 10 THEN 'consider_referencing_media'
    WHEN cma.max_embedded_comments > 50 THEN 'optimize_comment_embedding'
    ELSE 'embedding_appropriate'
  END as embedding_recommendation,
  
  CASE 
    WHEN cma.avg_content_size_bytes > 524288 THEN 'split_large_content'
    WHEN cma.avg_embedded_comments > 25 THEN 'implement_comment_pagination'
    ELSE 'structure_optimized'
  END as structure_optimization_recommendation,
  
  ROUND((cma.published_posts * 100.0 / cma.total_posts), 1) as data_completeness_percent,
  ROUND(cma.avg_readability_score, 1) as avg_profile_completeness,
  
  ROUND(cma.avg_categories_per_post, 1) as avg_skills_per_user,
  ROUND(cma.avg_tags_per_post, 1) as avg_following_per_user,
  ROUND(cma.avg_total_views, 0) as avg_followers_per_user,
  
  ARRAY[
    CASE WHEN cma.avg_word_count > 3000 THEN 'Consider content length optimization' END,
    CASE WHEN cma.avg_media_items > 5 THEN 'Optimize media storage and delivery' END,
    CASE WHEN cma.complex_content > cma.total_posts * 0.3 THEN 'Improve content readability' END
  ]::TEXT[] as optimization_recommendations,
  
  CASE 
    WHEN cma.avg_content_size_bytes > 524288 THEN 'critical_optimization_needed'
    WHEN cma.avg_embedded_comments > 25 THEN 'relationship_optimization_needed'
    ELSE 'data_model_optimized'
  END as overall_assessment,
  
  ARRAY[
    CASE WHEN cma.avg_content_size_bytes > 262144 THEN 'Optimize content storage and caching' END,
    CASE WHEN cma.max_embedded_comments > 50 THEN 'Implement comment pagination' END
  ]::TEXT[] as action_items,
  
  CASE 
    WHEN cma.avg_content_size_bytes > 262144 THEN 'high_performance_impact'
    ELSE 'low_performance_impact'
  END as performance_impact
  
FROM content_modeling_analysis cma
ORDER BY performance_impact DESC, total_documents DESC;

-- QueryLeaf provides comprehensive MongoDB data modeling capabilities:
-- 1. Flexible document schema design with embedded and referenced relationships
-- 2. Advanced validation rules and constraints for data integrity
-- 3. Optimized indexing strategies for diverse query patterns
-- 4. Performance-focused embedding and referencing decisions
-- 5. Schema evolution support with backward compatibility
-- 6. Data quality analysis and optimization recommendations
-- 7. SQL-familiar syntax for complex MongoDB data operations
-- 8. Enterprise-grade data governance and compliance features
-- 9. Automated performance optimization and monitoring
-- 10. Production-ready data modeling patterns for scalable applications
```

## Best Practices for Production Data Modeling

### Document Design Strategy and Performance Optimization

Essential principles for effective MongoDB data modeling in production environments:

1. **Embedding vs. Referencing Strategy**: Design optimal data relationships based on access patterns, update frequency, and document size constraints
2. **Schema Evolution Planning**: Implement flexible schemas that can evolve with application requirements while maintaining backward compatibility
3. **Performance-First Design**: Optimize document structures for common query patterns and minimize the need for complex aggregations
4. **Data Integrity Management**: Establish validation rules, referential integrity patterns, and data quality monitoring procedures
5. **Indexing Strategy**: Design comprehensive indexing strategies that support diverse query patterns while minimizing storage overhead
6. **Scalability Considerations**: Plan for growth patterns and design document structures that scale efficiently with data volume

### Enterprise Data Governance

Implement comprehensive data governance for enterprise-scale applications:

1. **Data Quality Framework**: Establish automated data validation, cleansing pipelines, and quality monitoring systems
2. **Schema Governance**: Implement version control, change approval processes, and automated migration procedures for schema evolution
3. **Compliance Integration**: Ensure data modeling patterns meet regulatory requirements and industry standards
4. **Performance Monitoring**: Monitor query performance, document size growth, and relationship efficiency continuously
5. **Data Lifecycle Management**: Design retention policies, archival strategies, and data purging procedures
6. **Documentation Standards**: Maintain comprehensive documentation for schemas, relationships, and optimization decisions

## Conclusion

MongoDB data modeling provides comprehensive document design capabilities that enable sophisticated relationship management, flexible schema evolution, and performance-optimized data structures through embedded documents, selective referencing, and intelligent denormalization strategies. The native document model and rich data types ensure that applications can represent complex data relationships naturally while maintaining optimal query performance.

Key MongoDB Data Modeling benefits include:

- **Flexible Document Structures**: Rich document model with native support for arrays, embedded objects, and hierarchical data organization
- **Optimized Relationships**: Strategic embedding and referencing patterns that balance performance, consistency, and maintainability
- **Schema Evolution**: Dynamic schema capabilities that adapt to changing requirements without complex migration procedures
- **Performance Optimization**: Document design patterns that minimize query complexity and maximize read/write efficiency
- **Data Integrity**: Comprehensive validation rules, constraints, and referential integrity patterns for production data quality
- **SQL Accessibility**: Familiar SQL-style data modeling operations through QueryLeaf for accessible document design

Whether you're designing user management systems, content platforms, e-commerce applications, or analytical systems, MongoDB data modeling with QueryLeaf's familiar SQL interface provides the foundation for sophisticated, scalable document-oriented applications.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB data modeling operations while providing SQL-familiar syntax for schema design, relationship management, and validation rules. Advanced document structures, embedding strategies, and performance optimization are seamlessly handled through familiar SQL constructs, making sophisticated data modeling accessible to SQL-oriented development teams.

The combination of MongoDB's flexible document capabilities with SQL-style modeling operations makes it an ideal platform for applications requiring both complex data relationships and familiar database design patterns, ensuring your data architecture can evolve efficiently while maintaining performance and consistency as application complexity and data volume grow.