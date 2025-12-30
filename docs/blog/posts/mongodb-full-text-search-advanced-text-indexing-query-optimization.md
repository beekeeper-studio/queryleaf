---
title: "MongoDB Full-Text Search and Advanced Text Indexing: Query Optimization and Natural Language Processing"
description: "Master MongoDB full-text search capabilities with advanced text indexing strategies, natural language processing, search relevance scoring, and production-scale text analytics with SQL-familiar search patterns."
date: 2025-12-29
tags: [mongodb, full-text-search, text-indexing, search-optimization, nlp, text-analytics, sql]
---

# MongoDB Full-Text Search and Advanced Text Indexing: Query Optimization and Natural Language Processing

Modern applications require sophisticated text search capabilities that go beyond simple pattern matching to deliver intelligent, contextual search experiences. MongoDB's full-text search features provide comprehensive text indexing, natural language processing, relevance scoring, and advanced query capabilities that rival dedicated search engines while maintaining the simplicity and integration benefits of database-native search functionality.

MongoDB text indexes automatically handle stemming, stop word filtering, language-specific text processing, and relevance scoring, enabling developers to build powerful search features without the complexity of maintaining separate search infrastructure. Combined with aggregation pipelines and flexible document structures, MongoDB delivers enterprise-grade text search capabilities with familiar SQL-style query patterns.

## The Text Search Challenge

Traditional database text queries using LIKE patterns are inefficient and limited:

```sql
-- Traditional SQL text search - limited and slow
SELECT product_id, name, description, category
FROM products
WHERE name LIKE '%wireless%'
   OR description LIKE '%bluetooth%'
   OR category LIKE '%electronics%';

-- Problems with pattern matching:
-- 1. Case sensitivity issues
-- 2. No support for word variations (wireless vs wirelessly)
-- 3. No relevance scoring or ranking
-- 4. Poor performance on large text fields
-- 5. No natural language processing
-- 6. Limited multi-field search capabilities
-- 7. No fuzzy matching or typo tolerance
```

MongoDB text search provides sophisticated alternatives:

```javascript
// Create comprehensive text index for advanced search
db.products.createIndex({
  "name": "text",
  "description": "text", 
  "category": "text",
  "tags": "text",
  "brand": "text",
  "specifications.features": "text"
}, {
  "default_language": "english",
  "language_override": "language",
  "name": "comprehensive_product_search",
  "weights": {
    "name": 10,           // Highest relevance for product names
    "category": 8,        // High relevance for categories
    "brand": 6,           // Medium-high relevance for brands
    "description": 4,     // Medium relevance for descriptions
    "tags": 3,            // Lower relevance for tags
    "specifications.features": 2  // Lowest relevance for detailed specs
  },
  "textIndexVersion": 3
})

// Sample product document structure optimized for text search
{
  "_id": ObjectId("..."),
  "product_id": "ELEC_HEADPHONE_001",
  "name": "Premium Wireless Noise-Canceling Headphones",
  "description": "Experience crystal-clear audio with advanced noise cancellation technology. Perfect for travel, office work, or immersive music listening sessions.",
  "category": "Electronics",
  "subcategory": "Audio Equipment",
  "brand": "TechAudio Pro",
  "price": 299.99,
  "currency": "USD",
  
  // Optimized for search
  "tags": ["wireless", "bluetooth", "noise-canceling", "premium", "travel", "office"],
  "search_keywords": ["headphones", "audio", "music", "wireless", "bluetooth", "noise-canceling"],
  
  // Product specifications with searchable features
  "specifications": {
    "features": [
      "Active noise cancellation",
      "Bluetooth 5.0 connectivity", 
      "40-hour battery life",
      "Fast charging capability",
      "Multi-device pairing",
      "Voice assistant integration"
    ],
    "technical": {
      "driver_size": "40mm",
      "frequency_response": "20Hz-20kHz",
      "impedance": "32 ohms",
      "weight": "250g"
    }
  },
  
  // Multi-language support
  "language": "english",
  "translations": {
    "spanish": {
      "name": "Auriculares Inalámbricos Premium con Cancelación de Ruido",
      "description": "Experimenta audio cristalino con tecnología avanzada de cancelación de ruido."
    }
  },
  
  // Search analytics and optimization
  "search_metadata": {
    "search_count": 0,
    "popular_queries": [],
    "last_updated": ISODate("2025-12-29T00:00:00Z"),
    "seo_optimized": true
  },
  
  // Business metadata
  "inventory": {
    "stock_count": 150,
    "availability": "in_stock",
    "warehouse_locations": ["US-WEST", "US-EAST", "EU-CENTRAL"]
  },
  "ratings": {
    "average_rating": 4.7,
    "total_reviews": 342,
    "rating_distribution": {
      "5_star": 198,
      "4_star": 89,
      "3_star": 35,
      "2_star": 12,
      "1_star": 8
    }
  },
  "created_at": ISODate("2025-12-01T00:00:00Z"),
  "updated_at": ISODate("2025-12-29T00:00:00Z")
}
```

## Advanced Text Search Queries

### Basic Full-Text Search with Relevance Scoring

```javascript
// Comprehensive text search with relevance scoring
db.products.aggregate([
  // Stage 1: Text search with scoring
  {
    $match: {
      $text: {
        $search: "wireless bluetooth headphones",
        $caseSensitive: false,
        $diacriticSensitive: false
      }
    }
  },
  
  // Stage 2: Add relevance score and metadata
  {
    $addFields: {
      relevance_score: { $meta: "textScore" },
      search_query: "wireless bluetooth headphones",
      search_timestamp: "$$NOW"
    }
  },
  
  // Stage 3: Enhanced relevance calculation
  {
    $addFields: {
      // Boost scores based on business factors
      boosted_score: {
        $multiply: [
          "$relevance_score",
          {
            $add: [
              1, // Base multiplier
              
              // Availability boost
              { $cond: [{ $eq: ["$inventory.availability", "in_stock"] }, 0.3, 0] },
              
              // Rating boost (high-rated products get higher relevance)
              { $multiply: [{ $subtract: ["$ratings.average_rating", 3] }, 0.1] },
              
              // Popular product boost
              { $cond: [{ $gt: ["$ratings.total_reviews", 100] }, 0.2, 0] },
              
              // Price range boost (mid-range products favored)
              {
                $cond: [
                  { $and: [{ $gte: ["$price", 50] }, { $lte: ["$price", 500] }] },
                  0.15,
                  0
                ]
              }
            ]
          }
        ]
      }
    }
  },
  
  // Stage 4: Category and brand analysis
  {
    $addFields: {
      category_match: {
        $cond: [
          { $regexMatch: { input: "$category", regex: /electronics|audio/i } },
          true,
          false
        ]
      },
      brand_popularity_score: {
        $switch: {
          branches: [
            { case: { $in: ["$brand", ["TechAudio Pro", "SoundMaster", "AudioElite"]] }, then: 1.2 },
            { case: { $in: ["$brand", ["BasicSound", "EcoAudio", "ValueTech"]] }, then: 0.9 }
          ],
          default: 1.0
        }
      }
    }
  },
  
  // Stage 5: Final score calculation
  {
    $addFields: {
      final_relevance_score: {
        $multiply: [
          "$boosted_score",
          "$brand_popularity_score",
          { $cond: ["$category_match", 1.1, 1.0] }
        ]
      }
    }
  },
  
  // Stage 6: Filter and sort results
  {
    $match: {
      "relevance_score": { $gte: 0.5 }, // Minimum relevance threshold
      "inventory.availability": { $ne: "discontinued" }
    }
  },
  
  // Stage 7: Sort by relevance and business factors
  {
    $sort: {
      "final_relevance_score": -1,
      "ratings.average_rating": -1,
      "ratings.total_reviews": -1
    }
  },
  
  // Stage 8: Project search results
  {
    $project: {
      product_id: 1,
      name: 1,
      description: 1,
      category: 1,
      brand: 1,
      price: 1,
      currency: 1,
      
      // Search relevance information
      search_metadata: {
        relevance_score: { $round: ["$relevance_score", 3] },
        boosted_score: { $round: ["$boosted_score", 3] },
        final_score: { $round: ["$final_relevance_score", 3] },
        search_query: "$search_query",
        search_timestamp: "$search_timestamp"
      },
      
      // Business information
      availability: "$inventory.availability",
      stock_count: "$inventory.stock_count",
      rating_info: {
        average_rating: "$ratings.average_rating",
        total_reviews: "$ratings.total_reviews"
      },
      
      // Highlighted text fields for search result display
      search_highlights: {
        name_highlight: "$name",
        description_highlight: { $substr: ["$description", 0, 150] },
        category_match: "$category_match"
      }
    }
  },
  
  { $limit: 20 }
])
```

### Advanced Multi-Language Text Search

```javascript
// Multi-language text search with language detection
db.products.aggregate([
  // Stage 1: Detect search language and perform text search
  {
    $match: {
      $or: [
        // English search
        { 
          $and: [
            { $text: { $search: "auriculares inalámbricos" } },
            { "language": "spanish" }
          ]
        },
        // Spanish search
        {
          $and: [
            { $text: { $search: "wireless headphones" } },
            { "language": "english" }
          ]
        },
        // Language-agnostic search (fallback)
        { $text: { $search: "auriculares inalámbricos wireless headphones" } }
      ]
    }
  },
  
  // Stage 2: Language-aware scoring
  {
    $addFields: {
      base_score: { $meta: "textScore" },
      detected_language: {
        $cond: [
          { $regexMatch: { input: "auriculares inalámbricos", regex: /[áéíóúñü]/i } },
          "spanish",
          "english"
        ]
      }
    }
  },
  
  // Stage 3: Apply language-specific boosts
  {
    $addFields: {
      language_adjusted_score: {
        $multiply: [
          "$base_score",
          {
            $cond: [
              { $eq: ["$detected_language", "$language"] },
              1.5, // Boost for exact language match
              1.0  // Standard score for cross-language matches
            ]
          }
        ]
      }
    }
  },
  
  // Stage 4: Add localized content
  {
    $addFields: {
      localized_name: {
        $cond: [
          { $eq: ["$detected_language", "spanish"] },
          "$translations.spanish.name",
          "$name"
        ]
      },
      localized_description: {
        $cond: [
          { $eq: ["$detected_language", "spanish"] },
          "$translations.spanish.description", 
          "$description"
        ]
      }
    }
  },
  
  { $sort: { "language_adjusted_score": -1 } },
  { $limit: 15 }
])
```

### Faceted Search with Text Queries

```javascript
// Advanced faceted search combining text search with categorical filtering
db.products.aggregate([
  // Stage 1: Text search foundation
  {
    $match: {
      $text: { $search: "gaming laptop high performance" }
    }
  },
  
  // Stage 2: Add text relevance score
  {
    $addFields: {
      text_score: { $meta: "textScore" }
    }
  },
  
  // Stage 3: Create facet aggregations
  {
    $facet: {
      // Main search results
      "search_results": [
        {
          $match: {
            "text_score": { $gte: 0.5 },
            "inventory.availability": { $in: ["in_stock", "limited_stock"] }
          }
        },
        {
          $sort: { "text_score": -1, "ratings.average_rating": -1 }
        },
        {
          $project: {
            product_id: 1,
            name: 1,
            brand: 1,
            price: 1,
            category: 1,
            subcategory: 1,
            text_score: { $round: ["$text_score", 2] },
            rating: "$ratings.average_rating",
            availability: "$inventory.availability"
          }
        },
        { $limit: 50 }
      ],
      
      // Price range facets
      "price_facets": [
        {
          $bucket: {
            groupBy: "$price",
            boundaries: [0, 100, 300, 500, 1000, 2000, 5000],
            default: "5000+",
            output: {
              count: { $sum: 1 },
              avg_price: { $avg: "$price" },
              avg_rating: { $avg: "$ratings.average_rating" }
            }
          }
        }
      ],
      
      // Category facets
      "category_facets": [
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
            avg_score: { $avg: "$text_score" },
            avg_price: { $avg: "$price" },
            avg_rating: { $avg: "$ratings.average_rating" }
          }
        },
        { $sort: { "avg_score": -1 } }
      ],
      
      // Brand facets
      "brand_facets": [
        {
          $group: {
            _id: "$brand",
            count: { $sum: 1 },
            avg_score: { $avg: "$text_score" },
            price_range: {
              min_price: { $min: "$price" },
              max_price: { $max: "$price" }
            },
            avg_rating: { $avg: "$ratings.average_rating" }
          }
        },
        { $sort: { "count": -1, "avg_score": -1 } },
        { $limit: 15 }
      ],
      
      // Rating facets
      "rating_facets": [
        {
          $bucket: {
            groupBy: "$ratings.average_rating",
            boundaries: [0, 2, 3, 4, 4.5, 5],
            default: "unrated",
            output: {
              count: { $sum: 1 },
              avg_score: { $avg: "$text_score" },
              price_range: {
                min_price: { $min: "$price" },
                max_price: { $max: "$price" }
              }
            }
          }
        }
      ],
      
      // Availability facets
      "availability_facets": [
        {
          $group: {
            _id: "$inventory.availability",
            count: { $sum: 1 },
            avg_score: { $avg: "$text_score" }
          }
        }
      ],
      
      // Search analytics
      "search_analytics": [
        {
          $group: {
            _id: null,
            total_results: { $sum: 1 },
            avg_relevance_score: { $avg: "$text_score" },
            score_distribution: {
              high_relevance: { $sum: { $cond: [{ $gte: ["$text_score", 1.5] }, 1, 0] } },
              medium_relevance: { $sum: { $cond: [{ $and: [{ $gte: ["$text_score", 1.0] }, { $lt: ["$text_score", 1.5] }] }, 1, 0] } },
              low_relevance: { $sum: { $cond: [{ $lt: ["$text_score", 1.0] }, 1, 0] } }
            },
            price_stats: {
              avg_price: { $avg: "$price" },
              min_price: { $min: "$price" },
              max_price: { $max: "$price" }
            }
          }
        }
      ]
    }
  },
  
  // Stage 4: Format faceted results
  {
    $project: {
      search_results: 1,
      facets: {
        price_ranges: "$price_facets",
        categories: "$category_facets", 
        brands: "$brand_facets",
        ratings: "$rating_facets",
        availability: "$availability_facets"
      },
      search_summary: {
        $arrayElemAt: ["$search_analytics", 0]
      }
    }
  }
])
```

### Auto-Complete and Suggestion Engine

```javascript
// Intelligent auto-complete system with typo tolerance
class MongoDBAutoCompleteEngine {
  constructor(db, collection) {
    this.db = db;
    this.collection = collection;
    this.suggestionCache = new Map();
  }
  
  async createAutoCompleteIndexes() {
    // Create text index for auto-complete
    await this.db[this.collection].createIndex({
      "name": "text",
      "tags": "text",
      "search_keywords": "text",
      "category": "text",
      "brand": "text"
    }, {
      name: "autocomplete_text_index",
      weights: {
        "name": 10,
        "brand": 8,
        "category": 6,
        "tags": 4,
        "search_keywords": 3
      }
    });
    
    // Create prefix-based indexes for fast auto-complete
    await this.db[this.collection].createIndex({
      "name": 1,
      "category": 1,
      "brand": 1
    }, {
      name: "prefix_autocomplete_index"
    });
  }
  
  async getAutoCompleteSuggestions(query, options = {}) {
    const maxSuggestions = options.maxSuggestions || 10;
    const includeCategories = options.includeCategories !== false;
    const includeBrands = options.includeBrands !== false;
    const minScore = options.minScore || 0.3;
    
    try {
      const suggestions = await this.db[this.collection].aggregate([
        // Stage 1: Multi-approach matching
        {
          $facet: {
            // Exact prefix matching
            "prefix_matches": [
              {
                $match: {
                  $or: [
                    { "name": { $regex: `^${this.escapeRegex(query)}`, $options: "i" } },
                    { "brand": { $regex: `^${this.escapeRegex(query)}`, $options: "i" } },
                    { "category": { $regex: `^${this.escapeRegex(query)}`, $options: "i" } }
                  ]
                }
              },
              {
                $addFields: {
                  suggestion_type: "prefix_match",
                  suggestion_text: {
                    $cond: [
                      { $regexMatch: { input: "$name", regex: new RegExp(`^${this.escapeRegex(query)}`, "i") } },
                      "$name",
                      {
                        $cond: [
                          { $regexMatch: { input: "$brand", regex: new RegExp(`^${this.escapeRegex(query)}`, "i") } },
                          "$brand",
                          "$category"
                        ]
                      }
                    ]
                  },
                  relevance_score: 2.0
                }
              },
              { $limit: 5 }
            ],
            
            // Full-text search suggestions
            "text_matches": [
              {
                $match: {
                  $text: { $search: query }
                }
              },
              {
                $addFields: {
                  suggestion_type: "text_match",
                  suggestion_text: "$name",
                  relevance_score: { $meta: "textScore" }
                }
              },
              {
                $match: { "relevance_score": { $gte: minScore } }
              },
              { $limit: 5 }
            ],
            
            // Fuzzy matching for typo tolerance
            "fuzzy_matches": [
              {
                $match: {
                  $or: [
                    { "name": { $regex: this.generateFuzzyRegex(query), $options: "i" } },
                    { "tags": { $elemMatch: { $regex: this.generateFuzzyRegex(query), $options: "i" } } }
                  ]
                }
              },
              {
                $addFields: {
                  suggestion_type: "fuzzy_match",
                  suggestion_text: "$name",
                  relevance_score: 1.0
                }
              },
              { $limit: 3 }
            ]
          }
        },
        
        // Stage 2: Combine and deduplicate suggestions
        {
          $project: {
            all_suggestions: {
              $concatArrays: ["$prefix_matches", "$text_matches", "$fuzzy_matches"]
            }
          }
        },
        
        // Stage 3: Unwind and process suggestions
        { $unwind: "$all_suggestions" },
        { $replaceRoot: { newRoot: "$all_suggestions" } },
        
        // Stage 4: Group to remove duplicates
        {
          $group: {
            _id: "$suggestion_text",
            suggestion_type: { $first: "$suggestion_type" },
            relevance_score: { $max: "$relevance_score" },
            product_count: { $sum: 1 },
            sample_product: { $first: "$$ROOT" }
          }
        },
        
        // Stage 5: Enhanced relevance scoring
        {
          $addFields: {
            final_score: {
              $multiply: [
                "$relevance_score",
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$suggestion_type", "prefix_match"] }, then: 1.5 },
                      { case: { $eq: ["$suggestion_type", "text_match"] }, then: 1.2 },
                      { case: { $eq: ["$suggestion_type", "fuzzy_match"] }, then: 0.8 }
                    ],
                    default: 1.0
                  }
                },
                // Boost popular suggestions
                { $add: [1.0, { $multiply: [{ $ln: "$product_count" }, 0.1] }] }
              ]
            }
          }
        },
        
        // Stage 6: Sort and limit results
        { $sort: { "final_score": -1, "_id": 1 } },
        { $limit: maxSuggestions },
        
        // Stage 7: Format final suggestions
        {
          $project: {
            suggestion: "$_id",
            type: "$suggestion_type",
            score: { $round: ["$final_score", 2] },
            product_count: 1,
            category: "$sample_product.category",
            brand: "$sample_product.brand"
          }
        }
      ]).toArray();
      
      return suggestions;
      
    } catch (error) {
      console.error('Auto-complete error:', error);
      return [];
    }
  }
  
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  generateFuzzyRegex(query) {
    // Simple fuzzy matching - allows one character difference per 4 characters
    const chars = query.split('');
    const pattern = chars.map((char, index) => {
      if (index % 4 === 0 && index > 0) {
        return `.?${this.escapeRegex(char)}`;
      }
      return this.escapeRegex(char);
    }).join('');
    
    return pattern;
  }
  
  async getSearchHistory(userId, limit = 20) {
    return await this.db.search_history.aggregate([
      { $match: { user_id: userId } },
      {
        $group: {
          _id: "$query",
          search_count: { $sum: 1 },
          last_searched: { $max: "$timestamp" },
          avg_results: { $avg: "$result_count" }
        }
      },
      { $sort: { "search_count": -1, "last_searched": -1 } },
      { $limit: limit },
      {
        $project: {
          query: "$_id",
          search_count: 1,
          last_searched: 1,
          suggestion_score: {
            $add: [
              { $multiply: [{ $ln: "$search_count" }, 0.3] },
              { $divide: [{ $subtract: ["$$NOW", "$last_searched"] }, 86400000] } // Days since last search
            ]
          }
        }
      }
    ]).toArray();
  }
}
```

## SQL-Style Text Search with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB text search operations:

```sql
-- Basic full-text search with SQL syntax
SELECT 
    product_id,
    name,
    description,
    brand,
    price,
    category,
    TEXTRANK() as relevance_score
FROM products
WHERE TEXTSEARCH('wireless bluetooth headphones')
  AND inventory.availability = 'in_stock'
ORDER BY relevance_score DESC
LIMIT 20;

-- Advanced text search with boosting and filtering
SELECT 
    name,
    brand,
    price,
    category,
    ratings.average_rating,
    TEXTRANK() * 
    CASE 
        WHEN ratings.average_rating >= 4.5 THEN 1.3
        WHEN ratings.average_rating >= 4.0 THEN 1.1
        ELSE 1.0
    END as boosted_score
FROM products
WHERE TEXTSEARCH('gaming laptop RTX', language='english')
  AND price BETWEEN 800 AND 3000
  AND ratings.average_rating >= 4.0
ORDER BY boosted_score DESC, price ASC;

-- Multi-field text search with field-specific weighting
SELECT 
    product_id,
    name,
    brand,
    description,
    category,
    price,
    TEXTRANK() as base_score,
    
    -- Calculate weighted scores for different fields
    CASE 
        WHEN name LIKE '%wireless%' THEN TEXTRANK() * 2.0
        WHEN brand LIKE '%tech%' THEN TEXTRANK() * 1.5
        WHEN category LIKE '%electronics%' THEN TEXTRANK() * 1.2
        ELSE TEXTRANK()
    END as weighted_score
    
FROM products
WHERE TEXTSEARCH('wireless technology premium')
ORDER BY weighted_score DESC;

-- Faceted search with text queries
WITH text_search_base AS (
    SELECT *,
           TEXTRANK() as relevance_score
    FROM products
    WHERE TEXTSEARCH('smartphone android camera')
      AND relevance_score >= 0.5
),

price_facets AS (
    SELECT 
        CASE 
            WHEN price < 200 THEN 'Under $200'
            WHEN price < 500 THEN '$200-$499'
            WHEN price < 800 THEN '$500-$799'
            WHEN price < 1200 THEN '$800-$1199'
            ELSE '$1200+'
        END as price_range,
        COUNT(*) as product_count,
        AVG(relevance_score) as avg_relevance
    FROM text_search_base
    GROUP BY 
        CASE 
            WHEN price < 200 THEN 'Under $200'
            WHEN price < 500 THEN '$200-$499'
            WHEN price < 500 THEN '$500-$799'
            WHEN price < 1200 THEN '$800-$1199'
            ELSE '$1200+'
        END
),

brand_facets AS (
    SELECT 
        brand,
        COUNT(*) as product_count,
        AVG(relevance_score) as avg_relevance,
        AVG(ratings.average_rating) as avg_rating
    FROM text_search_base
    GROUP BY brand
    ORDER BY avg_relevance DESC, product_count DESC
    LIMIT 10
)

SELECT 
    -- Main search results
    (SELECT JSON_AGG(JSON_BUILD_OBJECT(
        'product_id', product_id,
        'name', name,
        'brand', brand,
        'price', price,
        'relevance_score', ROUND(relevance_score, 2)
    )) 
    FROM (
        SELECT product_id, name, brand, price, relevance_score
        FROM text_search_base
        ORDER BY relevance_score DESC
        LIMIT 50
    ) results) as search_results,
    
    -- Price facets
    (SELECT JSON_AGG(JSON_BUILD_OBJECT(
        'range', price_range,
        'count', product_count,
        'avg_relevance', ROUND(avg_relevance, 2)
    ))
    FROM price_facets
    ORDER BY avg_relevance DESC) as price_facets,
    
    -- Brand facets
    (SELECT JSON_AGG(JSON_BUILD_OBJECT(
        'brand', brand,
        'count', product_count,
        'avg_relevance', ROUND(avg_relevance, 2),
        'avg_rating', ROUND(avg_rating, 1)
    ))
    FROM brand_facets) as brand_facets;

-- Auto-complete suggestions with SQL
SELECT DISTINCT
    name as suggestion,
    'product_name' as suggestion_type,
    TEXTRANK() as relevance_score
FROM products
WHERE TEXTSEARCH('wirele')  -- Partial query
   OR name ILIKE 'wirele%'   -- Prefix matching
ORDER BY relevance_score DESC
LIMIT 10

UNION ALL

SELECT DISTINCT
    brand as suggestion,
    'brand' as suggestion_type,
    2.0 as relevance_score  -- Fixed high score for brand matches
FROM products 
WHERE brand ILIKE 'wirele%'
LIMIT 5

UNION ALL

SELECT DISTINCT
    category as suggestion,
    'category' as suggestion_type,
    1.5 as relevance_score
FROM products
WHERE category ILIKE 'wirele%'
LIMIT 5

ORDER BY relevance_score DESC, suggestion ASC;

-- Search analytics and performance monitoring
WITH search_performance AS (
    SELECT 
        TEXTSEARCH('wireless headphones audio') as has_text_match,
        name,
        brand, 
        category,
        price,
        ratings.average_rating,
        TEXTRANK() as relevance_score,
        inventory.availability
    FROM products
    WHERE has_text_match
),

search_metrics AS (
    SELECT 
        COUNT(*) as total_results,
        AVG(relevance_score) as avg_relevance_score,
        COUNT(CASE WHEN relevance_score >= 1.5 THEN 1 END) as high_relevance_results,
        COUNT(CASE WHEN relevance_score >= 1.0 THEN 1 END) as medium_relevance_results,
        COUNT(CASE WHEN relevance_score < 1.0 THEN 1 END) as low_relevance_results,
        
        -- Price distribution in results
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        
        -- Rating distribution
        AVG(ratings.average_rating) as avg_rating,
        COUNT(CASE WHEN ratings.average_rating >= 4.0 THEN 1 END) as high_rated_results,
        
        -- Availability distribution  
        COUNT(CASE WHEN inventory.availability = 'in_stock' THEN 1 END) as available_results
    FROM search_performance
)

SELECT 
    -- Search quality metrics
    'Search Performance Report' as report_type,
    CURRENT_TIMESTAMP as generated_at,
    total_results,
    ROUND(avg_relevance_score, 3) as avg_relevance,
    
    -- Relevance distribution
    JSON_BUILD_OBJECT(
        'high_relevance', high_relevance_results,
        'medium_relevance', medium_relevance_results, 
        'low_relevance', low_relevance_results,
        'high_relevance_percent', ROUND((high_relevance_results::FLOAT / total_results * 100), 1)
    ) as relevance_distribution,
    
    -- Price insights
    JSON_BUILD_OBJECT(
        'avg_price', ROUND(avg_price, 2),
        'price_range', CONCAT('$', min_price, ' - $', max_price)
    ) as price_insights,
    
    -- Quality indicators
    JSON_BUILD_OBJECT(
        'avg_rating', ROUND(avg_rating, 2),
        'high_rated_percent', ROUND((high_rated_results::FLOAT / total_results * 100), 1),
        'availability_percent', ROUND((available_results::FLOAT / total_results * 100), 1)
    ) as quality_metrics,
    
    -- Search recommendations
    CASE 
        WHEN avg_relevance_score < 1.0 THEN 'Consider expanding search terms or adjusting index weights'
        WHEN high_relevance_results < 5 THEN 'Results may benefit from relevance boost tuning'
        WHEN available_results::FLOAT / total_results < 0.7 THEN 'High proportion of unavailable items in results'
        ELSE 'Search performance within acceptable ranges'
    END as recommendations

FROM search_metrics;

-- QueryLeaf provides comprehensive MongoDB text search capabilities:
-- 1. TEXTSEARCH() function for full-text search with natural language processing
-- 2. TEXTRANK() function for relevance scoring and ranking
-- 3. Multi-language support with language parameter specification
-- 4. Advanced text search operators integrated with SQL WHERE clauses
-- 5. Fuzzy matching and auto-complete functionality through SQL pattern matching
-- 6. Faceted search capabilities using standard SQL aggregation functions
-- 7. Search analytics and performance monitoring with familiar SQL reporting
-- 8. Integration with business logic through SQL CASE statements and functions
```

## Production Text Search Optimization

### Index Strategy and Performance Tuning

```javascript
// Comprehensive text search optimization strategy
class ProductionTextSearchOptimizer {
  constructor(db) {
    this.db = db;
    this.indexStats = new Map();
    this.searchMetrics = new Map();
  }
  
  async optimizeTextIndexes() {
    console.log('Optimizing text search indexes for production workload...');
    
    // Analysis current text search performance
    const currentIndexes = await this.analyzeCurrentIndexes();
    const queryPatterns = await this.analyzeSearchQueries();
    const fieldUsage = await this.analyzeFieldUsage();
    
    // Design optimal text index configuration
    const optimizedConfig = this.designOptimalIndexes(currentIndexes, queryPatterns, fieldUsage);
    
    // Implement new indexes with minimal downtime
    await this.implementOptimizedIndexes(optimizedConfig);
    
    return {
      optimization_summary: optimizedConfig,
      performance_improvements: await this.measurePerformanceImprovements(),
      recommendations: this.generateOptimizationRecommendations()
    };
  }
  
  async analyzeCurrentIndexes() {
    const indexStats = await this.db.products.aggregate([
      { $indexStats: {} },
      { 
        $match: { 
          "name": { $regex: /text/i }
        }
      },
      {
        $project: {
          index_name: "$name",
          usage_stats: {
            ops: "$accesses.ops",
            since: "$accesses.since"
          },
          index_size: "$host"  
        }
      }
    ]).toArray();
    
    return indexStats;
  }
  
  async analyzeSearchQueries() {
    // Analyze recent search patterns from application logs
    const searchPatterns = await this.db.search_logs.aggregate([
      {
        $match: {
          timestamp: { $gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } // Last 7 days
        }
      },
      {
        $group: {
          _id: "$query_type",
          query_count: { $sum: 1 },
          avg_response_time: { $avg: "$response_time_ms" },
          unique_queries: { $addToSet: "$search_terms" },
          popular_terms: { 
            $push: {
              terms: "$search_terms",
              result_count: "$result_count",
              click_through_rate: "$ctr"
            }
          }
        }
      },
      {
        $project: {
          query_type: "$_id",
          query_count: 1,
          avg_response_time: { $round: ["$avg_response_time", 2] },
          unique_query_count: { $size: "$unique_queries" },
          performance_score: {
            $multiply: [
              { $divide: [1000, "$avg_response_time"] }, // Speed factor
              { $ln: "$query_count" } // Volume factor
            ]
          }
        }
      }
    ]).toArray();
    
    return searchPatterns;
  }
  
  async createOptimizedTextIndex() {
    // Drop existing text indexes if they exist
    try {
      await this.db.products.dropIndex("comprehensive_product_search");
    } catch (error) {
      // Index may not exist, continue
    }
    
    // Create highly optimized text index
    const indexResult = await this.db.products.createIndex({
      // Primary searchable fields with optimized weights
      "name": "text",
      "brand": "text", 
      "category": "text",
      "subcategory": "text",
      "description": "text",
      "tags": "text",
      "search_keywords": "text",
      
      // Secondary searchable fields
      "specifications.features": "text",
      "specifications.technical.type": "text"
    }, {
      name: "optimized_product_search_v2",
      default_language: "english",
      language_override: "language",
      
      // Carefully tuned weights based on analysis
      weights: {
        "name": 15,                          // Highest priority - exact product names
        "brand": 12,                         // High priority - brand recognition
        "category": 10,                      // High priority - categorical searches  
        "subcategory": 8,                    // Medium-high priority
        "tags": 6,                           // Medium priority - user-generated tags
        "search_keywords": 6,                // Medium priority - SEO terms
        "description": 4,                    // Lower priority - detailed descriptions
        "specifications.features": 3,         // Low priority - technical features
        "specifications.technical.type": 2   // Lowest priority - technical specs
      },
      
      // Performance optimization
      textIndexVersion: 3,
      partialFilterExpression: {
        "inventory.availability": { $ne: "discontinued" },
        "active": true
      }
    });
    
    console.log('Optimized text index created:', indexResult);
    return indexResult;
  }
  
  async implementSearchPerformanceMonitoring() {
    // Create collection for search performance metrics
    await this.db.createCollection("search_performance_metrics");
    
    // Create TTL index for automatic cleanup of old metrics
    await this.db.search_performance_metrics.createIndex(
      { "timestamp": 1 },
      { expireAfterSeconds: 30 * 24 * 3600 } // 30 days
    );
    
    return {
      monitoring_enabled: true,
      retention_period: "30 days",
      metrics_collection: "search_performance_metrics"
    };
  }
  
  async measureSearchPerformance(query, options = {}) {
    const startTime = Date.now();
    
    try {
      // Execute the search with explain plan
      const searchResults = await this.db.products.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(options.limit || 20)
      .explain("executionStats");
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Record performance metrics
      const performanceMetrics = {
        query: query,
        execution_time_ms: executionTime,
        documents_examined: searchResults.executionStats.docsExamined,
        documents_returned: searchResults.executionStats.docsReturned,
        index_hits: searchResults.executionStats.indexesUsed?.length || 0,
        winning_plan: searchResults.queryPlanner.winningPlan.stage,
        timestamp: new Date(),
        
        // Performance classification
        performance_rating: this.classifyPerformance(executionTime, searchResults.executionStats),
        
        // Optimization recommendations
        optimization_suggestions: this.generatePerformanceRecommendations(searchResults)
      };
      
      // Store metrics for analysis
      await this.db.search_performance_metrics.insertOne(performanceMetrics);
      
      return performanceMetrics;
      
    } catch (error) {
      console.error('Search performance measurement failed:', error);
      return {
        query: query,
        error: error.message,
        timestamp: new Date()
      };
    }
  }
  
  classifyPerformance(executionTime, executionStats) {
    // Performance rating based on response time and efficiency
    if (executionTime < 50 && executionStats.docsExamined < executionStats.docsReturned * 2) {
      return "excellent";
    } else if (executionTime < 150 && executionStats.docsExamined < executionStats.docsReturned * 5) {
      return "good";
    } else if (executionTime < 500) {
      return "acceptable";
    } else {
      return "poor";
    }
  }
  
  generatePerformanceRecommendations(explainResult) {
    const recommendations = [];
    
    if (explainResult.executionStats.docsExamined > explainResult.executionStats.docsReturned * 10) {
      recommendations.push("High document examination ratio - consider more selective index or query optimization");
    }
    
    if (explainResult.executionStats.totalKeysExamined > explainResult.executionStats.docsReturned * 5) {
      recommendations.push("High index key examination - consider compound index optimization");
    }
    
    if (!explainResult.queryPlanner.indexFilterSet) {
      recommendations.push("Query not using optimal index filtering - consider index hint or query restructuring");
    }
    
    return recommendations;
  }
}
```

## Best Practices for Production Text Search

### Scaling and Performance Optimization

1. **Index Design**: Create targeted text indexes with appropriate field weights and language settings
2. **Query Optimization**: Use compound indexes combining text search with frequently filtered fields
3. **Performance Monitoring**: Implement comprehensive metrics collection for search query analysis
4. **Caching Strategy**: Cache frequently searched terms and results to reduce database load
5. **Load Balancing**: Distribute text search queries across multiple database nodes

### Search Quality and User Experience

1. **Relevance Tuning**: Continuously adjust text index weights based on user interaction data
2. **Auto-complete**: Implement intelligent suggestion systems with typo tolerance
3. **Faceted Search**: Provide multiple filtering dimensions to help users refine search results
4. **Search Analytics**: Track search patterns, click-through rates, and conversion metrics
5. **Multi-language Support**: Handle international search requirements with appropriate language processing

## Conclusion

MongoDB's full-text search capabilities provide enterprise-grade text search functionality that integrates seamlessly with document-based data models. The combination of sophisticated text indexing, natural language processing, and flexible scoring enables building powerful search experiences without external search infrastructure.

Key MongoDB text search advantages include:

- **Native Integration**: Built-in text search eliminates need for separate search servers
- **Advanced Linguistics**: Automatic stemming, stop words, and language-specific processing
- **Flexible Scoring**: Customizable relevance scoring with business logic integration
- **Performance Optimization**: Specialized text indexes optimized for search workloads
- **SQL Accessibility**: Familiar text search operations through QueryLeaf's SQL interface
- **Comprehensive Analytics**: Built-in search performance monitoring and optimization tools

Whether you're building e-commerce platforms, content management systems, knowledge bases, or document repositories, MongoDB's text search capabilities with QueryLeaf's SQL interface provide the foundation for delivering sophisticated search experiences that scale with your application requirements.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL text search operations into MongoDB's native full-text search queries, making advanced text search accessible through familiar SQL patterns. Complex search scenarios including relevance scoring, faceted search, and auto-complete functionality are seamlessly handled through standard SQL syntax, enabling developers to build powerful search features without learning MongoDB's text search specifics.

The combination of MongoDB's powerful text search engine with SQL-familiar query patterns creates an ideal platform for applications requiring both sophisticated search capabilities and familiar database interaction patterns, ensuring your search functionality can evolve and scale efficiently as your data and user requirements grow.