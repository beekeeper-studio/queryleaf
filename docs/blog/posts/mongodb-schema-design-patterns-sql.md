---
title: "MongoDB Schema Design Patterns: Optimizing Document Structure with SQL-Style Data Modeling"
description: "Master MongoDB schema design patterns for high-performance applications. Learn document embedding, referencing strategies, polymorphic patterns, and SQL-equivalent data modeling approaches for scalable databases."
date: 2025-09-06
tags: [mongodb, schema-design, data-modeling, performance, patterns, sql, scalability]
---

# MongoDB Schema Design Patterns: Optimizing Document Structure with SQL-Style Data Modeling

Effective database schema design is crucial for application performance, scalability, and maintainability. While MongoDB's document-based structure provides tremendous flexibility compared to rigid SQL table schemas, this flexibility can be both a blessing and a curse. Without proper design patterns and guidelines, MongoDB schemas can become inefficient, leading to poor query performance, excessive memory usage, and difficult maintenance.

MongoDB schema design requires understanding document relationships, query patterns, data access frequencies, and growth projections. The key to successful MongoDB applications lies in choosing the right schema patterns that align with your specific use cases while maintaining performance and flexibility for future requirements.

## The Schema Design Challenge

Traditional SQL databases enforce rigid schemas with predefined relationships:

```sql
-- Traditional SQL normalized schema
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE addresses (
    address_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id),
    street_address VARCHAR(200),
    city VARCHAR(50),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(50),
    address_type VARCHAR(20) DEFAULT 'shipping'
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id),
    shipping_address_id INTEGER REFERENCES addresses(address_id),
    billing_address_id INTEGER REFERENCES addresses(address_id),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10,2)
);

-- Complex queries require multiple JOINs
SELECT 
    c.first_name,
    c.last_name,
    c.email,
    o.order_date,
    o.total_amount,
    sa.street_address as shipping_street,
    sa.city as shipping_city,
    ba.street_address as billing_street,
    ba.city as billing_city
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
JOIN addresses sa ON o.shipping_address_id = sa.address_id
JOIN addresses ba ON o.billing_address_id = ba.address_id
WHERE c.customer_id = 123;

-- Problems with traditional normalized approach:
-- - Multiple table JOINs impact query performance
-- - Complex queries for simple data retrieval
-- - Schema changes require ALTER TABLE operations
-- - Relationships must be predefined and static
-- - Difficult to represent hierarchical or nested data
```

MongoDB document schemas can eliminate JOIN operations and provide flexible data structures:

```javascript
// MongoDB document schema - embedded approach
{
  _id: ObjectId("64f1a2c4567890abcdef1234"),
  firstName: "John",
  lastName: "Smith", 
  email: "john.smith@example.com",
  phone: "+1-555-123-4567",
  addresses: [
    {
      type: "shipping",
      street: "123 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "USA",
      isDefault: true
    },
    {
      type: "billing", 
      street: "456 Oak Ave",
      city: "Brooklyn",
      state: "NY",
      postalCode: "11201",
      country: "USA",
      isDefault: false
    }
  ],
  orders: [
    {
      orderId: ObjectId("64f1a2c4567890abcdef5678"),
      orderDate: ISODate("2025-09-06T14:30:00Z"),
      totalAmount: 259.99,
      status: "shipped",
      shippingAddress: {
        street: "123 Main St",
        city: "New York", 
        state: "NY",
        postalCode: "10001"
      },
      items: [
        {
          productId: ObjectId("64f1a2c4567890abcdef9abc"),
          productName: "Wireless Headphones",
          quantity: 1,
          unitPrice: 199.99
        },
        {
          productId: ObjectId("64f1a2c4567890abcdef9def"),
          productName: "Phone Case",
          quantity: 2,
          unitPrice: 29.99
        }
      ]
    }
  ],
  preferences: {
    newsletter: true,
    notifications: {
      email: true,
      sms: false,
      push: true
    },
    defaultCurrency: "USD",
    language: "en"
  },
  createdAt: ISODate("2025-08-15T09:00:00Z"),
  lastActivity: ISODate("2025-09-06T14:30:00Z")
}

// Benefits:
// - Single document query retrieves all related data
// - No complex JOIN operations required
// - Flexible schema allows different document structures
// - Natural representation of hierarchical data
// - Atomic operations on entire document
// - Easy to add new fields without schema migrations
```

## Core Schema Design Patterns

### Embedding vs Referencing

Choose between embedding and referencing based on data relationships and access patterns:

```javascript
// Schema design pattern analyzer
class SchemaDesignAnalyzer {
  constructor() {
    this.embeddingCriteria = {
      maxDocumentSize: 16 * 1024 * 1024, // 16MB BSON limit
      maxArrayElements: 1000, // Practical limit for embedded arrays
      updateFrequency: 'low', // Low update frequency favors embedding
      queryPatterns: 'together' // Data accessed together favors embedding
    };
  }

  analyzeRelationship(parentEntity, childEntity, relationshipInfo) {
    const analysis = {
      relationshipType: relationshipInfo.type, // 1:1, 1:many, many:many
      dataSize: relationshipInfo.estimatedSize,
      accessPattern: relationshipInfo.accessPattern,
      updateFrequency: relationshipInfo.updateFrequency,
      growthProjection: relationshipInfo.growthProjection
    };

    return this.recommendPattern(analysis);
  }

  recommendPattern(analysis) {
    const recommendations = [];

    // One-to-One relationships - usually embed
    if (analysis.relationshipType === '1:1') {
      if (analysis.dataSize < this.embeddingCriteria.maxDocumentSize / 10) {
        recommendations.push({
          pattern: 'embedding',
          confidence: 'high',
          reason: 'One-to-one relationship with small data size favors embedding'
        });
      }
    }

    // One-to-Many relationships - analyze carefully
    if (analysis.relationshipType === '1:many') {
      if (analysis.growthProjection === 'bounded' && 
          analysis.accessPattern === 'together') {
        recommendations.push({
          pattern: 'embedding',
          confidence: 'medium',
          reason: 'Bounded growth with related access patterns'
        });
      } else if (analysis.growthProjection === 'unbounded' ||
                 analysis.updateFrequency === 'high') {
        recommendations.push({
          pattern: 'referencing',
          confidence: 'high', 
          reason: 'Unbounded growth or high update frequency requires referencing'
        });
      }
    }

    // Many-to-Many relationships - usually reference
    if (analysis.relationshipType === 'many:many') {
      recommendations.push({
        pattern: 'referencing',
        confidence: 'high',
        reason: 'Many-to-many relationships require referencing to avoid duplication'
      });
    }

    return recommendations;
  }
}

// Example schema patterns

// Pattern 1: Embedding for One-to-One relationships
const userWithProfile = {
  _id: ObjectId("64f1a2c4567890abcdef1234"),
  username: "johndoe",
  email: "john@example.com",
  
  // Embedded profile information
  profile: {
    firstName: "John",
    lastName: "Doe",
    dateOfBirth: ISODate("1985-06-15T00:00:00Z"),
    biography: "Software engineer with 10 years of experience",
    avatar: {
      url: "https://cdn.example.com/avatars/johndoe.jpg",
      uploadedAt: ISODate("2025-09-01T10:00:00Z")
    },
    socialMedia: {
      twitter: "@johndoe",
      linkedin: "linkedin.com/in/johndoe",
      github: "github.com/johndoe"
    }
  },
  
  preferences: {
    theme: "dark",
    notifications: true,
    privacy: {
      profileVisible: true,
      emailVisible: false,
      activityVisible: true
    }
  },
  
  createdAt: ISODate("2024-12-01T00:00:00Z"),
  lastLogin: ISODate("2025-09-06T08:30:00Z")
};

// Pattern 2: Referencing for One-to-Many with unbounded growth
const userWithOrders = {
  _id: ObjectId("64f1a2c4567890abcdef1234"),
  username: "johndoe",
  email: "john@example.com",
  
  // Order summary for quick access
  orderSummary: {
    totalOrders: 47,
    totalSpent: 2859.94,
    averageOrderValue: 60.85,
    lastOrderDate: ISODate("2025-09-05T16:45:00Z"),
    favoriteCategories: ["electronics", "books", "clothing"]
  }
  // Orders stored in separate collection due to unbounded growth
};

// Separate orders collection
const orderDocument = {
  _id: ObjectId("64f1a2c4567890abcdef5678"),
  customerId: ObjectId("64f1a2c4567890abcdef1234"),
  orderNumber: "ORD-2025-000047",
  orderDate: ISODate("2025-09-05T16:45:00Z"),
  status: "delivered",
  
  items: [
    {
      productId: ObjectId("64f1a2c4567890abcdef9abc"),
      sku: "WH-2025-BT",
      name: "Wireless Bluetooth Headphones",
      category: "electronics",
      quantity: 1,
      unitPrice: 199.99,
      totalPrice: 199.99
    }
  ],
  
  shipping: {
    method: "standard",
    cost: 9.99,
    address: {
      street: "123 Main St",
      city: "New York",
      state: "NY",
      postalCode: "10001"
    },
    trackingNumber: "1Z999AA1234567890",
    estimatedDelivery: ISODate("2025-09-08T00:00:00Z")
  },
  
  totalAmount: 209.98,
  paymentMethod: "credit_card",
  paymentStatus: "completed"
};

// Pattern 3: Hybrid approach for moderate growth
const blogPostWithComments = {
  _id: ObjectId("64f1a2c4567890abcdef1234"),
  title: "Advanced MongoDB Schema Design",
  slug: "advanced-mongodb-schema-design",
  author: {
    userId: ObjectId("64f1a2c4567890abcdef5678"),
    name: "Jane Developer",
    avatar: "https://cdn.example.com/avatars/jane.jpg"
  },
  
  content: "Comprehensive guide to MongoDB schema design patterns...",
  publishedAt: ISODate("2025-09-06T10:00:00Z"),
  
  // Embed recent comments for quick display
  recentComments: [
    {
      commentId: ObjectId("64f1a2c4567890abcdef9abc"),
      author: {
        userId: ObjectId("64f1a2c4567890abcdef9def"),
        name: "Mike Reader"
      },
      content: "Great article! Very helpful examples.",
      createdAt: ISODate("2025-09-06T11:30:00Z"),
      likes: 5
    }
    // Only store 5-10 most recent comments embedded
  ],
  
  // Summary information
  commentSummary: {
    totalComments: 142,
    totalLikes: 387,
    lastCommentAt: ISODate("2025-09-06T14:22:00Z")
  },
  
  tags: ["mongodb", "database", "schema", "design", "tutorial"],
  viewCount: 2847,
  likeCount: 89
};
```

### Polymorphic Pattern

Handle documents with varying structures using polymorphic patterns:

```javascript
// Polymorphic schema pattern for heterogeneous data
class PolymorphicSchemaManager {
  constructor(db) {
    this.db = db;
    this.contentCollection = db.collection('content_items');
  }

  // Base schema with discriminator field
  createContentSchema() {
    return {
      // Common fields for all content types
      _id: ObjectId,
      type: String, // Discriminator field
      title: String,
      author: {
        userId: ObjectId,
        name: String
      },
      createdAt: Date,
      updatedAt: Date,
      publishedAt: Date,
      status: String, // 'draft', 'published', 'archived'
      tags: [String],
      
      // Type-specific fields added based on 'type' discriminator
      // Will vary by document type
    };
  }

  // Article-specific schema
  createArticle(articleData) {
    return {
      ...this.createContentSchema(),
      type: 'article',
      content: articleData.content,
      excerpt: articleData.excerpt,
      readingTime: articleData.readingTime,
      wordCount: articleData.wordCount,
      
      // Article-specific metadata
      seo: {
        metaDescription: articleData.metaDescription,
        keywords: articleData.keywords,
        canonicalUrl: articleData.canonicalUrl
      },
      
      // Social sharing data
      socialMedia: {
        featured: articleData.featuredImage,
        ogTitle: articleData.ogTitle,
        ogDescription: articleData.ogDescription
      }
    };
  }

  // Video-specific schema
  createVideo(videoData) {
    return {
      ...this.createContentSchema(),
      type: 'video',
      
      // Video-specific fields
      videoUrl: videoData.videoUrl,
      duration: videoData.duration, // seconds
      thumbnail: videoData.thumbnail,
      resolution: videoData.resolution,
      
      // Video metadata
      transcription: videoData.transcription,
      chapters: [
        {
          title: String,
          startTime: Number, // seconds
          endTime: Number
        }
      ],
      
      // Streaming information
      streaming: {
        formats: [
          {
            quality: String, // '720p', '1080p', '4K'
            url: String,
            fileSize: Number
          }
        ],
        subtitles: [
          {
            language: String,
            url: String
          }
        ]
      }
    };
  }

  // Podcast-specific schema  
  createPodcast(podcastData) {
    return {
      ...this.createContentSchema(),
      type: 'podcast',
      
      // Podcast-specific fields
      audioUrl: podcastData.audioUrl,
      duration: podcastData.duration,
      transcript: podcastData.transcript,
      
      // Podcast metadata
      episode: {
        number: podcastData.episodeNumber,
        season: podcastData.season,
        seriesId: ObjectId(podcastData.seriesId)
      },
      
      // Guest information
      guests: [
        {
          name: String,
          bio: String,
          socialMedia: {
            twitter: String,
            linkedin: String,
            website: String
          }
        }
      ]
    };
  }

  // Query patterns that work across all content types
  async findContentByType(contentType, filters = {}) {
    const query = { 
      type: contentType, 
      status: 'published',
      ...filters 
    };
    
    return await this.contentCollection
      .find(query)
      .sort({ publishedAt: -1 })
      .toArray();
  }

  // Polymorphic aggregation across content types
  async getContentStats(dateRange = {}) {
    const matchStage = {
      status: 'published'
    };
    
    if (dateRange.start || dateRange.end) {
      matchStage.publishedAt = {};
      if (dateRange.start) matchStage.publishedAt.$gte = dateRange.start;
      if (dateRange.end) matchStage.publishedAt.$lte = dateRange.end;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgViews: { $avg: '$viewCount' },
          totalViews: { $sum: '$viewCount' },
          
          // Type-specific aggregations using conditional operators
          totalDuration: {
            $sum: {
              $cond: {
                if: { $in: ['$type', ['video', 'podcast']] },
                then: '$duration',
                else: 0
              }
            }
          },
          
          avgWordCount: {
            $avg: {
              $cond: {
                if: { $eq: ['$type', 'article'] },
                then: '$wordCount',
                else: null
              }
            }
          },
          
          recentContent: { $push: '$title' }
        }
      },
      {
        $addFields: {
          contentType: '$_id',
          avgDurationFormatted: {
            $cond: {
              if: { $gt: ['$totalDuration', 0] },
              then: {
                $concat: [
                  { $toString: { $floor: { $divide: ['$totalDuration', 60] } } },
                  ' minutes'
                ]
              },
              else: null
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          contentType: 1,
          count: 1,
          avgViews: { $round: ['$avgViews', 0] },
          totalViews: 1,
          totalDuration: 1,
          avgDurationFormatted: 1,
          avgWordCount: { $round: ['$avgWordCount', 0] },
          recentTitles: { $slice: ['$recentContent', 5] }
        }
      },
      {
        $sort: { count: -1 }
      }
    ];

    return await this.contentCollection.aggregate(pipeline).toArray();
  }

  // Search across polymorphic content
  async searchContent(searchTerm, filters = {}) {
    const pipeline = [
      {
        $match: {
          $text: { $search: searchTerm },
          status: 'published',
          ...filters
        }
      },
      {
        $addFields: {
          searchScore: { $meta: 'textScore' },
          
          // Add type-specific display fields
          displayContent: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$type', 'article'] },
                  then: '$excerpt'
                },
                {
                  case: { $eq: ['$type', 'video'] },
                  then: {
                    $concat: [
                      'Video - ',
                      { $toString: { $floor: { $divide: ['$duration', 60] } } },
                      ' minutes'
                    ]
                  }
                },
                {
                  case: { $eq: ['$type', 'podcast'] },
                  then: {
                    $concat: [
                      'Episode ',
                      { $toString: '$episode.number' },
                      ' - ',
                      { $toString: { $floor: { $divide: ['$duration', 60] } } },
                      ' minutes'
                    ]
                  }
                }
              ],
              default: 'Content item'
            }
          }
        }
      },
      {
        $sort: { searchScore: { $meta: 'textScore' }, publishedAt: -1 }
      },
      {
        $limit: 20
      }
    ];

    return await this.contentCollection.aggregate(pipeline).toArray();
  }
}
```

### Attribute Pattern

Handle documents with many similar fields using the Attribute Pattern:

```javascript
// Attribute Pattern for flexible document structures
class AttributePatternManager {
  constructor(db) {
    this.db = db;
    this.productsCollection = db.collection('products');
  }

  // Traditional approach - rigid schema with many optional fields
  createTraditionalProductSchema() {
    return {
      _id: ObjectId,
      name: String,
      sku: String,
      category: String,
      price: Number,
      
      // Electronics-specific fields
      screenSize: Number, // Only for TVs, monitors, phones
      resolution: String, // Only for displays
      processor: String,  // Only for computers, phones
      memory: Number,     // Only for computers, phones
      storage: Number,    // Only for computers, phones
      
      // Clothing-specific fields
      size: String,       // Only for clothing
      color: String,      // Only for clothing, some electronics
      material: String,   // Only for clothing, furniture
      
      // Book-specific fields
      author: String,     // Only for books
      isbn: String,       // Only for books
      pages: Number,      // Only for books
      publisher: String,  // Only for books
      
      // Problems:
      // - Many null/undefined fields for each product type
      // - Schema becomes bloated and hard to maintain
      // - Difficult to add new product categories
      // - Indexes become inefficient due to sparse data
    };
  }

  // Attribute Pattern - flexible schema with key-value attributes
  createAttributePatternSchema(productData) {
    return {
      _id: ObjectId(),
      name: productData.name,
      sku: productData.sku,
      category: productData.category,
      price: productData.price,
      
      // Core fields that apply to all products
      brand: productData.brand,
      description: productData.description,
      inStock: productData.inStock,
      
      // Flexible attributes array for category-specific properties
      attributes: [
        {
          name: 'screenSize',
          value: '55',
          unit: 'inches',
          type: 'number',
          searchable: true,
          displayName: 'Screen Size'
        },
        {
          name: 'resolution',
          value: '4K Ultra HD',
          type: 'string',
          searchable: true,
          displayName: 'Resolution'
        },
        {
          name: 'smartTV',
          value: true,
          type: 'boolean',
          searchable: true,
          displayName: 'Smart TV Features'
        },
        {
          name: 'energyRating',
          value: 'A+',
          type: 'string',
          searchable: true,
          displayName: 'Energy Rating',
          category: 'specifications'
        }
      ],
      
      // Denormalized searchable attributes for query performance
      searchableAttributes: {
        'screenSize': 55,
        'resolution': '4K Ultra HD',
        'smartTV': true,
        'energyRating': 'A+'
      },
      
      // Attribute categories for UI organization
      attributeCategories: [
        {
          name: 'display',
          displayName: 'Display',
          attributes: ['screenSize', 'resolution']
        },
        {
          name: 'features',
          displayName: 'Features', 
          attributes: ['smartTV']
        },
        {
          name: 'specifications',
          displayName: 'Specifications',
          attributes: ['energyRating']
        }
      ],
      
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async createProduct(productData) {
    // Validate and process attributes
    const processedAttributes = this.processAttributes(productData.attributes);
    
    const product = {
      name: productData.name,
      sku: productData.sku,
      category: productData.category,
      price: productData.price,
      brand: productData.brand,
      description: productData.description,
      inStock: productData.inStock,
      
      attributes: processedAttributes.attributes,
      searchableAttributes: processedAttributes.searchableMap,
      attributeCategories: this.categorizeAttributes(processedAttributes.attributes),
      
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.productsCollection.insertOne(product);
    return { productId: result.insertedId, ...product };
  }

  processAttributes(attributesInput) {
    const attributes = [];
    const searchableMap = {};

    attributesInput.forEach(attr => {
      const processedAttr = {
        name: attr.name,
        value: attr.value,
        type: attr.type || this.inferType(attr.value),
        unit: attr.unit || null,
        searchable: attr.searchable !== false, // Default to true
        displayName: attr.displayName || this.formatDisplayName(attr.name),
        category: attr.category || 'general'
      };

      attributes.push(processedAttr);

      // Create searchable map for efficient querying
      if (processedAttr.searchable) {
        let searchValue = processedAttr.value;
        
        // Convert to appropriate type for searching
        if (processedAttr.type === 'number') {
          searchValue = parseFloat(searchValue);
        } else if (processedAttr.type === 'boolean') {
          searchValue = Boolean(searchValue);
        }
        
        searchableMap[processedAttr.name] = searchValue;
      }
    });

    return { attributes, searchableMap };
  }

  async searchProductsByAttributes(searchCriteria) {
    // Build query using searchableAttributes for performance
    const query = {};
    
    if (searchCriteria.category) {
      query.category = searchCriteria.category;
    }

    if (searchCriteria.priceRange) {
      query.price = {
        $gte: searchCriteria.priceRange.min || 0,
        $lte: searchCriteria.priceRange.max || Number.MAX_VALUE
      };
    }

    // Build attribute filters
    if (searchCriteria.attributes) {
      Object.entries(searchCriteria.attributes).forEach(([attrName, attrValue]) => {
        if (attrValue.operator === 'range' && attrValue.min !== undefined) {
          query[`searchableAttributes.${attrName}`] = {
            $gte: attrValue.min,
            $lte: attrValue.max || Number.MAX_VALUE
          };
        } else if (attrValue.operator === 'in') {
          query[`searchableAttributes.${attrName}`] = { $in: attrValue.values };
        } else {
          query[`searchableAttributes.${attrName}`] = attrValue;
        }
      });
    }

    return await this.productsCollection
      .find(query)
      .sort({ price: 1 })
      .toArray();
  }

  async getAttributeFilterOptions(category) {
    // Generate filter options for UI based on existing attributes
    const pipeline = [
      { $match: { category: category } },
      { $unwind: '$attributes' },
      {
        $group: {
          _id: {
            name: '$attributes.name',
            displayName: '$attributes.displayName',
            type: '$attributes.type',
            unit: '$attributes.unit'
          },
          values: { 
            $addToSet: '$attributes.value' 
          },
          minValue: { 
            $min: {
              $cond: {
                if: { $eq: ['$attributes.type', 'number'] },
                then: { $toDouble: '$attributes.value' },
                else: null
              }
            }
          },
          maxValue: {
            $max: {
              $cond: {
                if: { $eq: ['$attributes.type', 'number'] },
                then: { $toDouble: '$attributes.value' },
                else: null
              }
            }
          },
          productCount: { $sum: 1 }
        }
      },
      {
        $project: {
          attributeName: '$_id.name',
          displayName: '$_id.displayName',
          type: '$_id.type',
          unit: '$_id.unit',
          values: 1,
          minValue: 1,
          maxValue: 1,
          productCount: 1,
          
          // Format for UI consumption
          filterConfig: {
            $cond: {
              if: { $eq: ['$_id.type', 'number'] },
              then: {
                type: 'range',
                min: '$minValue',
                max: '$maxValue',
                unit: '$_id.unit'
              },
              else: {
                type: 'select',
                options: '$values'
              }
            }
          },
          _id: 0
        }
      },
      { $sort: { productCount: -1 } }
    ];

    return await this.productsCollection.aggregate(pipeline).toArray();
  }

  async updateProductAttributes(productId, attributeUpdates) {
    const product = await this.productsCollection.findOne({ _id: ObjectId(productId) });
    
    if (!product) {
      throw new Error('Product not found');
    }

    // Update specific attributes while preserving others
    const updatedAttributes = product.attributes.map(attr => {
      const update = attributeUpdates.find(u => u.name === attr.name);
      return update ? { ...attr, ...update, updatedAt: new Date() } : attr;
    });

    // Add new attributes
    attributeUpdates.forEach(update => {
      const exists = updatedAttributes.find(attr => attr.name === update.name);
      if (!exists) {
        updatedAttributes.push({
          ...update,
          type: update.type || this.inferType(update.value),
          searchable: update.searchable !== false,
          displayName: update.displayName || this.formatDisplayName(update.name),
          createdAt: new Date()
        });
      }
    });

    // Rebuild searchable attributes
    const searchableMap = {};
    updatedAttributes.forEach(attr => {
      if (attr.searchable) {
        searchableMap[attr.name] = this.convertToSearchableType(attr.value, attr.type);
      }
    });

    const updateResult = await this.productsCollection.updateOne(
      { _id: ObjectId(productId) },
      {
        $set: {
          attributes: updatedAttributes,
          searchableAttributes: searchableMap,
          attributeCategories: this.categorizeAttributes(updatedAttributes),
          updatedAt: new Date()
        }
      }
    );

    return updateResult;
  }

  // Utility methods
  inferType(value) {
    if (typeof value === 'boolean') return 'boolean';
    if (!isNaN(value) && !isNaN(parseFloat(value))) return 'number';
    return 'string';
  }

  formatDisplayName(name) {
    return name.replace(/([A-Z])/g, ' $1')
               .replace(/^./, str => str.toUpperCase())
               .trim();
  }

  convertToSearchableType(value, type) {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return Boolean(value);
      default:
        return value;
    }
  }

  categorizeAttributes(attributes) {
    // Group attributes by category for UI organization
    const categories = {};
    
    attributes.forEach(attr => {
      const category = attr.category || 'general';
      if (!categories[category]) {
        categories[category] = {
          name: category,
          displayName: this.formatDisplayName(category),
          attributes: []
        };
      }
      categories[category].attributes.push(attr.name);
    });

    return Object.values(categories);
  }
}
```

## Advanced Schema Patterns

### Bucket Pattern

Optimize for time-series and high-volume data using the Bucket Pattern:

```javascript
// Bucket Pattern for time-series and IoT data optimization
class BucketPatternManager {
  constructor(db) {
    this.db = db;
    this.bucketSize = 60; // 60 measurements per bucket (1 hour if 1 per minute)
    this.sensorDataCollection = db.collection('sensor_data_buckets');
  }

  // Traditional approach - one document per measurement
  createTraditionalSensorReading() {
    return {
      _id: ObjectId(),
      deviceId: 'sensor_001',
      timestamp: ISODate('2025-09-06T14:30:00Z'),
      temperature: 23.5,
      humidity: 65.2,
      pressure: 1013.25,
      location: {
        building: 'A',
        floor: 3,
        room: '301'
      }
    };
    // Problems:
    // - High insertion overhead (many small documents)
    // - Index overhead scales linearly with measurements
    // - Poor query performance for time ranges
    // - Inefficient storage utilization
  }

  // Bucket Pattern - group measurements by time and device
  createSensorDataBucket(deviceId, bucketStartTime) {
    return {
      _id: ObjectId(),
      deviceId: deviceId,
      bucketStartTime: bucketStartTime,
      bucketEndTime: new Date(bucketStartTime.getTime() + 60 * 60 * 1000), // 1 hour
      
      // Device metadata (denormalized for query efficiency)
      deviceInfo: {
        type: 'environmental_sensor',
        model: 'EnvSensor_v2.1',
        location: {
          building: 'A',
          floor: 3,
          room: '301',
          coordinates: { lat: 40.7128, lng: -74.0060 }
        }
      },
      
      // Bucket statistics for quick analysis
      stats: {
        measurementCount: 0,
        temperature: { min: null, max: null, sum: 0, avg: null },
        humidity: { min: null, max: null, sum: 0, avg: null },
        pressure: { min: null, max: null, sum: 0, avg: null }
      },
      
      // Time-series measurements array
      measurements: [
        // Will be populated with individual readings
      ],
      
      createdAt: new Date(),
      lastUpdated: new Date()
    };
  }

  async addSensorReading(deviceId, reading) {
    const bucketStartTime = this.getBucketStartTime(reading.timestamp);
    const bucketId = `${deviceId}_${bucketStartTime.toISOString()}`;
    
    // Try to add to existing bucket
    const updateResult = await this.sensorDataCollection.updateOne(
      {
        deviceId: deviceId,
        bucketStartTime: bucketStartTime,
        'stats.measurementCount': { $lt: this.bucketSize }
      },
      {
        $push: {
          measurements: {
            timestamp: reading.timestamp,
            temperature: reading.temperature,
            humidity: reading.humidity,
            pressure: reading.pressure
          }
        },
        $inc: { 
          'stats.measurementCount': 1,
          'stats.temperature.sum': reading.temperature,
          'stats.humidity.sum': reading.humidity,
          'stats.pressure.sum': reading.pressure
        },
        $min: {
          'stats.temperature.min': reading.temperature,
          'stats.humidity.min': reading.humidity,
          'stats.pressure.min': reading.pressure
        },
        $max: {
          'stats.temperature.max': reading.temperature,
          'stats.humidity.max': reading.humidity,
          'stats.pressure.max': reading.pressure
        },
        $set: { lastUpdated: new Date() }
      }
    );

    // Create new bucket if no existing bucket found or bucket is full
    if (updateResult.matchedCount === 0) {
      const newBucket = this.createSensorDataBucket(deviceId, bucketStartTime);
      newBucket.measurements = [{
        timestamp: reading.timestamp,
        temperature: reading.temperature,
        humidity: reading.humidity,
        pressure: reading.pressure
      }];
      newBucket.stats = {
        measurementCount: 1,
        temperature: { 
          min: reading.temperature, 
          max: reading.temperature, 
          sum: reading.temperature,
          avg: reading.temperature
        },
        humidity: { 
          min: reading.humidity, 
          max: reading.humidity, 
          sum: reading.humidity,
          avg: reading.humidity
        },
        pressure: { 
          min: reading.pressure, 
          max: reading.pressure, 
          sum: reading.pressure,
          avg: reading.pressure
        }
      };

      await this.sensorDataCollection.insertOne(newBucket);
    } else {
      // Update averages after successful insertion
      await this.updateBucketAverages(deviceId, bucketStartTime);
    }
  }

  async updateBucketAverages(deviceId, bucketStartTime) {
    // Recalculate averages after adding measurements
    await this.sensorDataCollection.updateOne(
      { deviceId: deviceId, bucketStartTime: bucketStartTime },
      [
        {
          $set: {
            'stats.temperature.avg': { 
              $divide: ['$stats.temperature.sum', '$stats.measurementCount'] 
            },
            'stats.humidity.avg': { 
              $divide: ['$stats.humidity.sum', '$stats.measurementCount'] 
            },
            'stats.pressure.avg': { 
              $divide: ['$stats.pressure.sum', '$stats.measurementCount'] 
            }
          }
        }
      ]
    );
  }

  async querySensorDataRange(deviceId, startTime, endTime) {
    // Query buckets that overlap with the time range
    const pipeline = [
      {
        $match: {
          deviceId: deviceId,
          bucketStartTime: { $lte: endTime },
          bucketEndTime: { $gte: startTime }
        }
      },
      {
        $unwind: '$measurements'
      },
      {
        $match: {
          'measurements.timestamp': {
            $gte: startTime,
            $lte: endTime
          }
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$measurements',
              {
                deviceId: '$deviceId',
                deviceInfo: '$deviceInfo'
              }
            ]
          }
        }
      },
      {
        $sort: { timestamp: 1 }
      }
    ];

    return await this.sensorDataCollection.aggregate(pipeline).toArray();
  }

  async getDeviceStatsSummary(deviceId, timeRange) {
    // Get aggregated statistics across multiple buckets
    const pipeline = [
      {
        $match: {
          deviceId: deviceId,
          bucketStartTime: { 
            $gte: timeRange.start,
            $lte: timeRange.end 
          }
        }
      },
      {
        $group: {
          _id: '$deviceId',
          totalMeasurements: { $sum: '$stats.measurementCount' },
          temperature: {
            min: { $min: '$stats.temperature.min' },
            max: { $max: '$stats.temperature.max' },
            avgOfAvgs: { $avg: '$stats.temperature.avg' }
          },
          humidity: {
            min: { $min: '$stats.humidity.min' },
            max: { $max: '$stats.humidity.max' },
            avgOfAvgs: { $avg: '$stats.humidity.avg' }
          },
          pressure: {
            min: { $min: '$stats.pressure.min' },
            max: { $max: '$stats.pressure.max' },
            avgOfAvgs: { $avg: '$stats.pressure.avg' }
          },
          deviceInfo: { $first: '$deviceInfo' },
          bucketsAnalyzed: { $sum: 1 },
          timeRange: {
            start: { $min: '$bucketStartTime' },
            end: { $max: '$bucketEndTime' }
          }
        }
      },
      {
        $project: {
          deviceId: '$_id',
          totalMeasurements: 1,
          temperature: {
            min: { $round: ['$temperature.min', 1] },
            max: { $round: ['$temperature.max', 1] },
            avg: { $round: ['$temperature.avgOfAvgs', 1] }
          },
          humidity: {
            min: { $round: ['$humidity.min', 1] },
            max: { $round: ['$humidity.max', 1] },
            avg: { $round: ['$humidity.avgOfAvgs', 1] }
          },
          pressure: {
            min: { $round: ['$pressure.min', 2] },
            max: { $round: ['$pressure.max', 2] },
            avg: { $round: ['$pressure.avgOfAvgs', 2] }
          },
          deviceInfo: 1,
          bucketsAnalyzed: 1,
          timeRange: 1,
          _id: 0
        }
      }
    ];

    const results = await this.sensorDataCollection.aggregate(pipeline).toArray();
    return results[0];
  }

  getBucketStartTime(timestamp) {
    // Round down to the nearest hour for hourly buckets
    const date = new Date(timestamp);
    date.setMinutes(0, 0, 0);
    return date;
  }

  async setupBucketIndexes() {
    // Optimize indexes for bucket pattern queries
    await this.sensorDataCollection.createIndexes([
      // Primary bucket lookup
      { key: { deviceId: 1, bucketStartTime: 1 } },
      
      // Time range queries
      { key: { bucketStartTime: 1, bucketEndTime: 1 } },
      
      // Device queries
      { key: { deviceId: 1, bucketStartTime: -1 } },
      
      // Location-based queries
      { key: { 'deviceInfo.location.building': 1, 'deviceInfo.location.floor': 1 } },
      
      // Geospatial queries
      { key: { 'deviceInfo.location.coordinates': '2dsphere' } }
    ]);
  }
}
```

### Computed Pattern

Store pre-calculated values to improve query performance:

```javascript
// Computed Pattern for performance optimization
class ComputedPatternManager {
  constructor(db) {
    this.db = db;
    this.ordersCollection = db.collection('orders');
    this.customersCollection = db.collection('customers');
  }

  // Traditional approach requiring real-time calculations
  async getCustomerInsightsTraditional(customerId) {
    const pipeline = [
      { $match: { customerId: ObjectId(customerId) } },
      {
        $group: {
          _id: '$customerId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          avgOrderValue: { $avg: '$totalAmount' },
          firstOrderDate: { $min: '$orderDate' },
          lastOrderDate: { $max: '$orderDate' },
          favoriteCategories: { $push: '$items.category' }
        }
      },
      {
        $addFields: {
          customerLifetimeDays: {
            $divide: [
              { $subtract: [new Date(), '$firstOrderDate'] },
              86400000 // milliseconds in a day
            ]
          }
        }
      }
    ];

    // Problems:
    // - Expensive aggregation on every request
    // - Poor performance as order history grows
    // - High CPU usage for frequently accessed data
    // - Scaling issues with concurrent requests

    return await this.ordersCollection.aggregate(pipeline).toArray();
  }

  // Computed Pattern - pre-calculate and store values
  async createCustomerWithComputedFields(customerData) {
    const customer = {
      _id: ObjectId(),
      firstName: customerData.firstName,
      lastName: customerData.lastName,
      email: customerData.email,
      phone: customerData.phone,
      
      // Core customer information
      addresses: customerData.addresses || [],
      preferences: customerData.preferences || {},
      
      // Computed order statistics (updated on each order)
      orderStats: {
        totalOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        largestOrder: 0,
        smallestOrder: null,
        
        // Time-based analytics
        firstOrderDate: null,
        lastOrderDate: null,
        customerLifetimeDays: 0,
        averageDaysBetweenOrders: 0,
        
        // Purchase behavior patterns
        favoriteCategories: [],
        preferredPaymentMethods: [],
        seasonalPatterns: {
          spring: { orders: 0, spent: 0 },
          summer: { orders: 0, spent: 0 },
          fall: { orders: 0, spent: 0 },
          winter: { orders: 0, spent: 0 }
        },
        
        // Customer lifecycle stage
        lifeCycleStage: 'new', // new, active, at_risk, churned, vip
        riskScore: 0, // 0-100 churn risk score
        clvScore: 0   // Customer Lifetime Value score
      },
      
      // Category-specific insights
      categoryInsights: [
        // Will be populated as: { category: 'electronics', orders: 5, spent: 1299.99, lastPurchase: Date }
      ],
      
      // Behavioral segments
      segments: ['new_customer'], // Updated based on computed metrics
      
      // Last computation timestamp for staleness detection
      lastComputedAt: new Date(),
      
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.customersCollection.insertOne(customer);
    return customer;
  }

  async updateCustomerComputedFields(customerId, newOrder) {
    const session = this.db.client.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Get current customer data
        const customer = await this.customersCollection.findOne(
          { _id: ObjectId(customerId) },
          { session }
        );

        if (!customer) {
          throw new Error('Customer not found');
        }

        // Calculate updated statistics
        const updatedStats = this.calculateUpdatedStats(customer.orderStats, newOrder);
        const updatedCategoryInsights = this.updateCategoryInsights(
          customer.categoryInsights || [], 
          newOrder
        );
        const updatedSegments = this.calculateCustomerSegments(updatedStats, customer);

        // Update customer document with computed values
        await this.customersCollection.updateOne(
          { _id: ObjectId(customerId) },
          {
            $set: {
              orderStats: updatedStats,
              categoryInsights: updatedCategoryInsights,
              segments: updatedSegments,
              lastComputedAt: new Date(),
              updatedAt: new Date()
            }
          },
          { session }
        );

        // Insert the order
        await this.ordersCollection.insertOne({
          ...newOrder,
          customerId: ObjectId(customerId)
        }, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  calculateUpdatedStats(currentStats, newOrder) {
    const newTotalOrders = currentStats.totalOrders + 1;
    const newTotalSpent = currentStats.totalSpent + newOrder.totalAmount;
    const newAverageOrderValue = newTotalSpent / newTotalOrders;
    
    const today = new Date();
    const orderDate = new Date(newOrder.orderDate);
    
    // Calculate time-based metrics
    let customerLifetimeDays = currentStats.customerLifetimeDays;
    let averageDaysBetweenOrders = currentStats.averageDaysBetweenOrders;
    
    const firstOrderDate = currentStats.firstOrderDate || orderDate;
    if (currentStats.firstOrderDate) {
      customerLifetimeDays = Math.floor((today - firstOrderDate) / (1000 * 60 * 60 * 24));
      if (newTotalOrders > 1) {
        averageDaysBetweenOrders = Math.floor(customerLifetimeDays / (newTotalOrders - 1));
      }
    }

    // Calculate seasonal patterns
    const season = this.getSeason(orderDate);
    const seasonalPatterns = { ...currentStats.seasonalPatterns };
    seasonalPatterns[season].orders += 1;
    seasonalPatterns[season].spent += newOrder.totalAmount;

    // Update favorite categories
    const categories = newOrder.items.map(item => item.category);
    const favoriteCategories = this.updateFavoriteCategories(
      currentStats.favoriteCategories || [], 
      categories
    );

    // Calculate lifecycle stage and risk scores
    const lifeCycleStage = this.calculateLifeCycleStage(newTotalOrders, customerLifetimeDays, averageDaysBetweenOrders);
    const riskScore = this.calculateChurnRiskScore(currentStats, orderDate);
    const clvScore = this.calculateCLVScore(newTotalSpent, newTotalOrders, customerLifetimeDays);

    return {
      totalOrders: newTotalOrders,
      totalSpent: Math.round(newTotalSpent * 100) / 100,
      averageOrderValue: Math.round(newAverageOrderValue * 100) / 100,
      largestOrder: Math.max(currentStats.largestOrder || 0, newOrder.totalAmount),
      smallestOrder: currentStats.smallestOrder ? 
        Math.min(currentStats.smallestOrder, newOrder.totalAmount) : 
        newOrder.totalAmount,
      
      firstOrderDate: firstOrderDate,
      lastOrderDate: orderDate,
      customerLifetimeDays: customerLifetimeDays,
      averageDaysBetweenOrders: averageDaysBetweenOrders,
      
      favoriteCategories: favoriteCategories,
      preferredPaymentMethods: this.updatePreferredPaymentMethods(
        currentStats.preferredPaymentMethods || [], 
        newOrder.paymentMethod
      ),
      seasonalPatterns: seasonalPatterns,
      
      lifeCycleStage: lifeCycleStage,
      riskScore: riskScore,
      clvScore: clvScore
    };
  }

  updateCategoryInsights(currentInsights, newOrder) {
    const categoryMap = new Map();
    
    // Load existing insights
    currentInsights.forEach(insight => {
      categoryMap.set(insight.category, insight);
    });

    // Update with new order data
    newOrder.items.forEach(item => {
      const existing = categoryMap.get(item.category) || {
        category: item.category,
        orders: 0,
        spent: 0,
        items: 0,
        firstPurchase: new Date(newOrder.orderDate),
        lastPurchase: new Date(newOrder.orderDate),
        averageOrderValue: 0
      };

      existing.orders += 1;
      existing.spent += item.price * item.quantity;
      existing.items += item.quantity;
      existing.lastPurchase = new Date(newOrder.orderDate);
      existing.averageOrderValue = existing.spent / existing.orders;

      categoryMap.set(item.category, existing);
    });

    return Array.from(categoryMap.values())
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10); // Keep top 10 categories
  }

  calculateCustomerSegments(orderStats, customer) {
    const segments = [];

    // Value-based segments
    if (orderStats.totalSpent > 5000) {
      segments.push('vip');
    } else if (orderStats.totalSpent > 1000) {
      segments.push('high_value');
    } else if (orderStats.totalSpent > 200) {
      segments.push('medium_value');
    } else {
      segments.push('low_value');
    }

    // Frequency-based segments
    if (orderStats.averageDaysBetweenOrders < 30) {
      segments.push('frequent_buyer');
    } else if (orderStats.averageDaysBetweenOrders < 90) {
      segments.push('regular_buyer');
    } else {
      segments.push('occasional_buyer');
    }

    // Lifecycle segments
    segments.push(orderStats.lifeCycleStage);

    // Risk segments
    if (orderStats.riskScore > 70) {
      segments.push('high_churn_risk');
    } else if (orderStats.riskScore > 40) {
      segments.push('medium_churn_risk');
    }

    // Behavioral segments
    const topCategory = orderStats.favoriteCategories[0];
    if (topCategory) {
      segments.push(`${topCategory}_enthusiast`);
    }

    return segments;
  }

  async getCustomerInsightsOptimized(customerId) {
    // Simply retrieve pre-computed values - much faster!
    const customer = await this.customersCollection.findOne(
      { _id: ObjectId(customerId) },
      {
        projection: {
          firstName: 1,
          lastName: 1,
          email: 1,
          orderStats: 1,
          categoryInsights: 1,
          segments: 1,
          lastComputedAt: 1
        }
      }
    );

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Check if computed data is stale (older than 24 hours)
    const dataAge = Date.now() - customer.lastComputedAt.getTime();
    const isStale = dataAge > 24 * 60 * 60 * 1000;

    return {
      ...customer,
      dataAge: Math.floor(dataAge / (1000 * 60 * 60)), // hours
      isStale: isStale
    };
  }

  // Utility methods
  getSeason(date) {
    const month = date.getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  updateFavoriteCategories(current, newCategories) {
    const categoryCount = new Map();
    
    // Count existing categories
    current.forEach(cat => {
      categoryCount.set(cat.category, (categoryCount.get(cat.category) || 0) + cat.count);
    });

    // Add new categories
    newCategories.forEach(cat => {
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
    });

    // Convert back to array and sort by count
    return Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 categories
  }

  updatePreferredPaymentMethods(current, newMethod) {
    const methodMap = new Map();
    
    current.forEach(method => {
      methodMap.set(method.method, method.count);
    });

    methodMap.set(newMethod, (methodMap.get(newMethod) || 0) + 1);

    return Array.from(methodMap.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);
  }

  calculateLifeCycleStage(totalOrders, lifetimeDays, avgDaysBetweenOrders) {
    if (totalOrders === 1) return 'new';
    if (totalOrders >= 20 && avgDaysBetweenOrders < 45) return 'vip';
    if (avgDaysBetweenOrders > 180) return 'at_risk';
    if (lifetimeDays > 365 && avgDaysBetweenOrders < 90) return 'loyal';
    return 'active';
  }

  calculateChurnRiskScore(stats, lastOrderDate) {
    const daysSinceLastOrder = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
    const avgDays = stats.averageDaysBetweenOrders || 30;
    
    let risk = 0;
    
    // Time since last order risk
    if (daysSinceLastOrder > avgDays * 2) risk += 40;
    else if (daysSinceLastOrder > avgDays * 1.5) risk += 20;
    
    // Order frequency risk  
    if (stats.totalOrders < 3) risk += 20;
    
    // Engagement risk
    if (stats.averageOrderValue < 50) risk += 15;
    
    return Math.min(risk, 100);
  }

  calculateCLVScore(totalSpent, totalOrders, lifetimeDays) {
    if (lifetimeDays === 0) return totalSpent;
    
    const annualValue = (totalSpent / lifetimeDays) * 365;
    const frequencyMultiplier = Math.min(totalOrders / 12, 2); // Max 2x for frequency
    
    return Math.round(annualValue * frequencyMultiplier);
  }
}
```

## QueryLeaf Schema Design Integration

QueryLeaf provides SQL-familiar approaches to MongoDB schema design:

```sql
-- QueryLeaf schema design with SQL-style patterns

-- Embedded document queries (equivalent to SQL JOINs)
SELECT 
  c.firstName,
  c.lastName,
  c.email,
  addr.street,
  addr.city,
  addr.state
FROM customers c,
     c.addresses addr
WHERE addr.type = 'shipping'
  AND addr.isDefault = true;

-- Reference-based queries (traditional foreign key style)
SELECT 
  o.orderNumber,
  o.orderDate,
  o.totalAmount,
  c.firstName,
  c.lastName
FROM orders o
JOIN customers c ON o.customerId = c._id
WHERE o.orderDate >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY o.totalAmount DESC;

-- Polymorphic content queries
SELECT 
  title,
  author.name,
  publishedAt,
  CASE type
    WHEN 'article' THEN CONCAT('Article - ', wordCount, ' words')
    WHEN 'video' THEN CONCAT('Video - ', FLOOR(duration/60), ' minutes')
    WHEN 'podcast' THEN CONCAT('Podcast Episode ', episode.number)
    ELSE 'Content'
  END as content_description
FROM content_items
WHERE status = 'published'
  AND publishedAt >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY publishedAt DESC;

-- Attribute pattern queries with dynamic filtering
SELECT 
  name,
  sku,
  price,
  category,
  -- Extract specific attributes as columns
  searchableAttributes.screenSize as screen_size,
  searchableAttributes.resolution as resolution,
  searchableAttributes.smartTV as smart_tv
FROM products
WHERE category = 'televisions'
  AND searchableAttributes.screenSize >= 50
  AND searchableAttributes.smartTV = true
  AND price BETWEEN 500 AND 2000
ORDER BY price ASC;

-- Bucket pattern time-series queries
SELECT 
  deviceId,
  DATE_TRUNC('day', bucketStartTime) as measurement_date,
  SUM(stats.measurementCount) as total_readings,
  AVG(stats.temperature.avg) as avg_temperature,
  MIN(stats.temperature.min) as min_temperature,
  MAX(stats.temperature.max) as max_temperature
FROM sensor_data_buckets
WHERE deviceId IN ('sensor_001', 'sensor_002', 'sensor_003')
  AND bucketStartTime >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY deviceId, DATE_TRUNC('day', bucketStartTime)
ORDER BY measurement_date DESC, deviceId;

-- Computed pattern optimized queries
SELECT 
  firstName,
  lastName,
  email,
  orderStats.totalOrders as total_orders,
  orderStats.totalSpent as total_spent,
  orderStats.averageOrderValue as avg_order_value,
  orderStats.lifeCycleStage as customer_stage,
  ARRAY_TO_STRING(segments, ', ') as customer_segments
FROM customers
WHERE orderStats.lifeCycleStage = 'vip'
  AND orderStats.totalSpent > 1000
  AND 'frequent_buyer' = ANY(segments)
ORDER BY orderStats.totalSpent DESC;

-- Complex schema analysis queries
WITH schema_analysis AS (
  SELECT 
    collection_name,
    COUNT(*) as document_count,
    AVG(BSON_SIZE(document)) as avg_doc_size,
    SUM(BSON_SIZE(document)) / 1024 / 1024 as total_size_mb
  FROM system_collections
  GROUP BY collection_name
)
SELECT 
  collection_name,
  document_count,
  ROUND(avg_doc_size::numeric, 0) as avg_size_bytes,
  ROUND(total_size_mb::numeric, 2) as total_mb,
  CASE 
    WHEN avg_doc_size > 1048576 THEN 'Large documents - consider referencing'
    WHEN avg_doc_size < 1000 THEN 'Small documents - consider embedding'
    ELSE 'Optimal size'
  END as size_recommendation
FROM schema_analysis
ORDER BY total_size_mb DESC;

-- QueryLeaf automatically optimizes for:
-- 1. Document embedding vs referencing decisions
-- 2. Index recommendations based on query patterns  
-- 3. Schema pattern detection and suggestions
-- 4. Query performance optimization across patterns
-- 5. Automatic handling of polymorphic document structures
```

## Best Practices for MongoDB Schema Design

### Schema Design Guidelines

Essential practices for effective MongoDB schema design:

1. **Understand Query Patterns**: Design schemas based on how data will be queried, not just how it's structured
2. **Consider Data Relationships**: Choose embedding vs referencing based on relationship cardinality and access patterns
3. **Plan for Growth**: Consider how document size and collection growth will impact performance
4. **Optimize for Common Operations**: Design schemas to minimize the number of database operations for frequent use cases
5. **Use Appropriate Patterns**: Apply established patterns (Attribute, Bucket, Computed) where they fit your use case
6. **Index Strategy**: Design indexes that support your schema patterns and query requirements

### Performance Considerations

Optimize schema design for performance:

1. **Document Size**: Keep frequently accessed documents under 1MB when possible
2. **Array Growth**: Limit embedded array sizes to prevent unbounded growth
3. **Atomic Operations**: Design schemas to support atomic operations where needed
4. **Read vs Write Optimization**: Balance schema design between read and write performance requirements
5. **Computed Values**: Use computed patterns for frequently calculated values
6. **Index Efficiency**: Design schemas that work well with compound indexes

## Conclusion

MongoDB schema design requires thoughtful consideration of data relationships, access patterns, and performance requirements. The flexibility of document-based storage provides powerful opportunities for optimization, but also requires careful planning to avoid common pitfalls.

Key schema design principles include:

- **Pattern-Based Design**: Apply proven patterns (Embedding, Referencing, Attribute, Bucket, Computed) based on specific use cases
- **Query-Driven Modeling**: Design schemas primarily around query patterns rather than data normalization
- **Performance Optimization**: Balance document size, array growth, and atomic operation requirements
- **Flexibility Planning**: Design schemas that can evolve with changing application requirements
- **Indexing Strategy**: Create schemas that work efficiently with MongoDB's indexing capabilities

Whether you're building e-commerce platforms, content management systems, IoT applications, or analytics platforms, MongoDB schema patterns with QueryLeaf's familiar SQL interface provide the foundation for scalable, high-performance applications. This combination enables you to implement sophisticated data models while preserving familiar development patterns and query approaches.

> **QueryLeaf Integration**: QueryLeaf automatically detects MongoDB schema patterns and optimizes SQL queries to leverage document structures, embedded relationships, and computed values. Complex schema patterns, polymorphic queries, and pattern-specific optimizations are seamlessly handled through familiar SQL syntax while maintaining the performance benefits of well-designed MongoDB schemas.

The integration of flexible document modeling with SQL-style query patterns makes MongoDB an ideal platform for applications requiring both sophisticated data structures and familiar database interaction patterns, ensuring your schema designs remain both powerful and maintainable as they scale and evolve.