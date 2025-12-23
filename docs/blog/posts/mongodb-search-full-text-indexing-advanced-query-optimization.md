---
title: "MongoDB Search and Full-Text Indexing: Advanced Query Optimization Strategies for Production Applications"
description: "Master MongoDB full-text search with advanced indexing strategies, query optimization, and production-ready search patterns. Learn text indexing, search ranking, and performance tuning for high-volume search workloads."
date: 2025-12-22
tags: [mongodb, search, indexing, text-search, performance, optimization, production]
---

# MongoDB Search and Full-Text Indexing: Advanced Query Optimization Strategies for Production Applications

Modern applications require sophisticated search capabilities that go far beyond simple equality matches. Users expect fast, relevant, and intuitive search experiences across large datasets, requiring robust full-text search implementations that can handle complex queries, multiple languages, and high-volume concurrent search workloads.

MongoDB's text indexing and search capabilities provide powerful tools for implementing production-grade search functionality directly within your database, eliminating the need for external search engines in many use cases while offering advanced features like stemming, language-specific analysis, weighted field scoring, and comprehensive search result ranking.

## The Search Performance Challenge

Traditional approaches to search in databases often rely on inefficient pattern matching that becomes prohibitively slow as data volumes grow:

```sql
-- Inefficient traditional search approaches that don't scale

-- Problem 1: LIKE patterns with leading wildcards (full table scan)
SELECT 
    product_id,
    product_name,
    description,
    category,
    price
FROM products
WHERE product_name ILIKE '%wireless%'
   OR description ILIKE '%bluetooth%'
   OR category ILIKE '%audio%'
ORDER BY product_name;

-- Problems with this approach:
-- 1. No index utilization - requires full collection scan
-- 2. Case-insensitive LIKE operations are expensive
-- 3. No relevance scoring or ranking
-- 4. Poor performance with large datasets (>100K documents)
-- 5. No language-specific search capabilities
-- 6. Cannot handle synonyms, stemming, or fuzzy matching
-- 7. Complex multi-field searches become increasingly expensive

-- Problem 2: Multiple field searches with OR conditions (inefficient)
SELECT 
    blog_id,
    title,
    content,
    author,
    tags,
    published_date,
    view_count
FROM blog_posts
WHERE (title ILIKE '%machine learning%' OR title ILIKE '%AI%' OR title ILIKE '%artificial intelligence%')
   OR (content ILIKE '%neural network%' OR content ILIKE '%deep learning%')
   OR (tags::text ILIKE '%data science%')
   OR (author ILIKE '%expert%')
ORDER BY published_date DESC, view_count DESC;

-- Problems:
-- 1. Multiple OR conditions prevent index optimization
-- 2. No relevance scoring - results ordered by publication date, not relevance
-- 3. Searches across different field types (text, arrays) are complex
-- 4. Cannot boost importance of matches in title vs content
-- 5. No support for partial word matches or typo tolerance
-- 6. Performance degrades exponentially with dataset size

-- Problem 3: Complex e-commerce search with filters (unoptimized)
SELECT 
    p.product_id,
    p.product_name,
    p.description,
    p.category,
    p.brand,
    p.price,
    p.rating,
    p.review_count,
    CASE 
        WHEN p.product_name ILIKE '%search_term%' THEN 3
        WHEN p.description ILIKE '%search_term%' THEN 2
        WHEN p.category ILIKE '%search_term%' THEN 1
        ELSE 0
    END as relevance_score
FROM products p
JOIN product_inventory pi ON p.product_id = pi.product_id
WHERE (p.product_name ILIKE '%wireless headphones%' 
       OR p.description ILIKE '%wireless headphones%' 
       OR p.category ILIKE '%headphones%')
  AND pi.quantity_available > 0
  AND p.price BETWEEN 50 AND 300
  AND p.rating >= 4.0
  AND p.brand IN ('Sony', 'Bose', 'Apple', 'Samsung')
ORDER BY relevance_score DESC, p.rating DESC, p.review_count DESC;

-- Problems:
-- 1. Manual relevance scoring is simplistic and doesn't handle phrase matching
-- 2. CASE statement for scoring prevents index usage
-- 3. Multiple ILIKE operations across large text fields are expensive
-- 4. Cannot handle variations in search terms (e.g., "headphone" vs "headphones")
-- 5. No support for fuzzy matching or typo tolerance
-- 6. Filter conditions after search prevent search optimization
-- 7. Results ranking doesn't consider text search relevance properly

-- Problem 4: Multi-language content search (inadequate)
SELECT 
    document_id,
    title_english,
    title_spanish,
    title_french,
    content_english,
    content_spanish,
    content_french,
    language,
    created_date
FROM multilingual_documents
WHERE (language = 'en' AND (title_english ILIKE '%innovation%' OR content_english ILIKE '%technology%'))
   OR (language = 'es' AND (title_spanish ILIKE '%innovación%' OR content_spanish ILIKE '%tecnología%'))
   OR (language = 'fr' AND (title_french ILIKE '%innovation%' OR content_french ILIKE '%technologie%'))
ORDER BY created_date DESC;

-- Problems:
-- 1. Requires maintaining separate fields for each language
-- 2. No language-specific stemming or analysis
-- 3. Search terms must be manually translated
-- 4. Complex query structure for multiple languages
-- 5. Cannot handle mixed-language content
-- 6. No support for language-specific stop words or stemming
-- 7. Difficult to maintain and extend to new languages

-- These traditional approaches face fundamental limitations:
-- 1. Performance Issues: Full table scans, no search-optimized indexes
-- 2. Relevance Problems: No intelligent ranking or scoring
-- 3. Language Barriers: Limited multi-language and stemming support
-- 4. Maintenance Complexity: Complex query structures that are hard to optimize
-- 5. Scalability Limitations: Performance degrades significantly with data growth
-- 6. User Experience: Poor search quality and slow response times
-- 7. Development Overhead: Manual implementation of search features
```

MongoDB's text indexing provides comprehensive solutions to these search challenges:

```javascript
// MongoDB Advanced Full-Text Search Implementation

// Create comprehensive text index with field weighting
db.products.createIndex({
  product_name: "text",
  description: "text", 
  category: "text",
  tags: "text",
  specifications: "text"
}, {
  weights: {
    product_name: 10,    // Highest priority - exact name matches
    category: 8,         // High priority - category relevance
    tags: 6,            // Medium-high priority - structured metadata
    description: 4,      // Medium priority - detailed descriptions
    specifications: 2    // Lower priority - technical details
  },
  name: "product_search_index",
  default_language: "english",
  language_override: "search_language"
})

// Advanced search with scoring and filtering
db.products.aggregate([
  // Stage 1: Text search with advanced matching
  {
    $match: {
      $and: [
        {
          $text: {
            $search: "wireless bluetooth headphones",
            $caseSensitive: false,
            $diacriticSensitive: false
          }
        },
        {
          price: { $gte: 50, $lte: 300 }
        },
        {
          "inventory.quantity_available": { $gt: 0 }
        },
        {
          rating: { $gte: 4.0 }
        },
        {
          brand: { $in: ["Sony", "Bose", "Apple", "Samsung"] }
        }
      ]
    }
  },
  
  // Stage 2: Add comprehensive search scoring
  {
    $addFields: {
      // MongoDB's built-in text relevance score
      text_score: { $meta: "textScore" },
      
      // Business logic scoring
      business_score: {
        $add: [
          { $multiply: ["$rating", 2] },           // Rating boost
          { $divide: [{ $ln: "$review_count" }, 10] }, // Review count boost (logarithmic)
          { $cond: [{ $eq: ["$featured", true] }, 5, 0] }, // Featured product boost
          { $cond: [{ $gt: ["$inventory.quantity_available", 10] }, 2, 0] } // High inventory boost
        ]
      },
      
      // Combined relevance score
      combined_score: {
        $add: [
          { $multiply: [{ $meta: "textScore" }, 3] }, // Text relevance (3x weight)
          "$business_score"                           // Business scoring
        ]
      },
      
      // Add search result metadata
      search_metadata: {
        matched_fields: {
          $switch: {
            branches: [
              { case: { $regexMatch: { input: "$product_name", regex: /wireless|bluetooth|headphones/i } }, then: ["product_name"] },
              { case: { $regexMatch: { input: "$description", regex: /wireless|bluetooth|headphones/i } }, then: ["description"] },
              { case: { $regexMatch: { input: "$category", regex: /wireless|bluetooth|headphones/i } }, then: ["category"] }
            ],
            default: ["description"]
          }
        },
        search_terms_found: {
          $size: {
            $filter: {
              input: ["wireless", "bluetooth", "headphones"],
              cond: {
                $or: [
                  { $regexMatch: { input: "$product_name", regex: { $concat: [".*", "$$this", ".*"] }, options: "i" } },
                  { $regexMatch: { input: "$description", regex: { $concat: [".*", "$$this", ".*"] }, options: "i" } }
                ]
              }
            }
          }
        }
      }
    }
  },
  
  // Stage 3: Sort by combined relevance and business metrics
  {
    $sort: {
      combined_score: -1,
      rating: -1,
      review_count: -1
    }
  },
  
  // Stage 4: Add search result highlighting (simulated)
  {
    $addFields: {
      highlighted_name: {
        $replaceAll: {
          input: "$product_name",
          find: { $regex: "(wireless|bluetooth|headphones)", $options: "i" },
          replacement: "<mark>$1</mark>"
        }
      },
      highlighted_description: {
        $substr: [
          {
            $replaceAll: {
              input: "$description",
              find: { $regex: "(wireless|bluetooth|headphones)", $options: "i" },
              replacement: "<mark>$1</mark>"
            }
          },
          0, 200
        ]
      }
    }
  },
  
  // Stage 5: Project final search results
  {
    $project: {
      product_id: 1,
      product_name: 1,
      highlighted_name: 1,
      description: 1,
      highlighted_description: 1,
      category: 1,
      brand: 1,
      price: 1,
      rating: 1,
      review_count: 1,
      text_score: 1,
      business_score: 1,
      combined_score: 1,
      search_metadata: 1,
      "inventory.quantity_available": 1,
      featured: 1
    }
  },
  
  // Stage 6: Limit results for pagination
  { $limit: 20 }
])
```

## Advanced Text Index Configuration

### Multi-Field Text Indexes with Strategic Weighting

Design text indexes that optimize for your specific search requirements:

```javascript
// E-commerce product search with sophisticated field weighting
db.products.createIndex({
  // Primary product information (highest weights)
  product_name: "text",
  brand: "text",
  model: "text",
  
  // Product categorization (high weights)
  category: "text",
  subcategory: "text",
  tags: "text",
  
  // Descriptive content (medium weights)
  short_description: "text",
  long_description: "text",
  key_features: "text",
  
  // Technical specifications (lower weights)
  specifications: "text",
  technical_details: "text",
  
  // User-generated content (contextual weights)
  "reviews.title": "text",
  "reviews.content": "text"
}, {
  weights: {
    // Product identity - highest priority
    product_name: 15,
    brand: 12,
    model: 10,
    
    // Categorization - high priority
    category: 9,
    subcategory: 8,
    tags: 7,
    
    // Marketing content - medium-high priority
    short_description: 6,
    key_features: 5,
    long_description: 4,
    
    // Technical content - medium priority
    specifications: 3,
    technical_details: 2,
    
    // User content - lower priority but valuable for discovery
    "reviews.title": 3,
    "reviews.content": 1
  },
  name: "comprehensive_product_search",
  default_language: "english",
  language_override: "product_language",
  textIndexVersion: 3 // Latest version for better performance
})

// Blog/Content search index with content-specific weighting
db.blog_posts.createIndex({
  title: "text",
  subtitle: "text",
  content: "text",
  summary: "text",
  tags: "text",
  category: "text",
  "author.name": "text",
  "author.bio": "text"
}, {
  weights: {
    title: 20,        // Titles are most important for relevance
    subtitle: 15,     // Secondary headlines
    summary: 10,      // Executive summaries
    tags: 8,         // Structured metadata
    category: 6,     // Topic categorization
    "author.name": 5, // Author attribution
    content: 3,      // Full content (lower weight due to length)
    "author.bio": 1  // Background information
  },
  name: "blog_content_search",
  default_language: "english"
})

// Multi-language document search with language-specific optimization
db.documents.createIndex({
  "title.english": "text",
  "title.spanish": "text", 
  "title.french": "text",
  "content.english": "text",
  "content.spanish": "text",
  "content.french": "text",
  keywords: "text",
  global_tags: "text"
}, {
  weights: {
    "title.english": 10,
    "title.spanish": 10,
    "title.french": 10,
    "content.english": 5,
    "content.spanish": 5,
    "content.french": 5,
    keywords: 8,
    global_tags: 6
  },
  name: "multilingual_document_search",
  language_override: "primary_language"
})
```

### Language-Specific Search Optimization

Implement language-aware search with proper stemming and stop word handling:

```javascript
// Language-specific search implementation
async function performLanguageAwareSearch(searchTerms, targetLanguage = 'english', options = {}) {
  const languageConfigs = {
    'english': {
      stemming: true,
      stopWords: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
      synonyms: {
        'car': ['automobile', 'vehicle', 'auto'],
        'phone': ['mobile', 'smartphone', 'cell'],
        'computer': ['pc', 'laptop', 'desktop', 'workstation']
      }
    },
    'spanish': {
      stemming: true,
      stopWords: ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le'],
      synonyms: {
        'coche': ['automóvil', 'vehículo', 'auto'],
        'teléfono': ['móvil', 'smartphone', 'celular'],
        'computadora': ['ordenador', 'pc', 'portátil']
      }
    },
    'french': {
      stemming: true,
      stopWords: ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour'],
      synonyms: {
        'voiture': ['automobile', 'véhicule', 'auto'],
        'téléphone': ['mobile', 'smartphone', 'portable'],
        'ordinateur': ['pc', 'portable', 'laptop']
      }
    }
  };
  
  const config = languageConfigs[targetLanguage] || languageConfigs['english'];
  
  // Expand search terms with synonyms
  let expandedTerms = searchTerms;
  for (const [original, synonyms] of Object.entries(config.synonyms)) {
    if (searchTerms.toLowerCase().includes(original)) {
      expandedTerms += ' ' + synonyms.join(' ');
    }
  }
  
  // Build language-aware search query
  const searchQuery = {
    $text: {
      $search: expandedTerms,
      $language: targetLanguage,
      $caseSensitive: false,
      $diacriticSensitive: false
    }
  };
  
  // Add additional filters if provided
  if (options.filters) {
    Object.assign(searchQuery, options.filters);
  }
  
  return await db.multilingual_content.aggregate([
    { $match: searchQuery },
    {
      $addFields: {
        relevance_score: { $meta: "textScore" },
        language_match_boost: {
          $cond: [
            { $eq: ["$primary_language", targetLanguage] },
            2.0,  // Boost documents in target language
            1.0
          ]
        },
        final_score: {
          $multiply: [{ $meta: "textScore" }, "$language_match_boost"]
        }
      }
    },
    { $sort: { final_score: -1, created_at: -1 } },
    { $limit: options.limit || 20 }
  ]).toArray();
}

// Usage examples for different languages
const englishResults = await performLanguageAwareSearch(
  "machine learning artificial intelligence", 
  "english",
  { filters: { category: "technology" }, limit: 15 }
);

const spanishResults = await performLanguageAwareSearch(
  "aprendizaje automático inteligencia artificial",
  "spanish", 
  { filters: { category: "tecnología" }, limit: 15 }
);

const frenchResults = await performLanguageAwareSearch(
  "apprentissage automatique intelligence artificielle",
  "french",
  { filters: { category: "technologie" }, limit: 15 }
);
```

## Search Result Ranking and Scoring

### Advanced Relevance Scoring Strategies

Implement sophisticated scoring that combines text relevance with business metrics:

```javascript
// Advanced search result ranking with multiple scoring factors
db.products.aggregate([
  // Stage 1: Initial text search
  {
    $match: {
      $text: {
        $search: "premium wireless noise cancelling headphones",
        $caseSensitive: false
      }
    }
  },
  
  // Stage 2: Comprehensive scoring algorithm
  {
    $addFields: {
      // Base text relevance score
      text_relevance: { $meta: "textScore" },
      
      // Popularity scoring (normalized)
      popularity_score: {
        $add: [
          // Review count influence (logarithmic to prevent dominance)
          { $multiply: [{ $ln: { $add: ["$review_count", 1] } }, 0.1] },
          // Rating influence (4.0+ ratings get boost)
          { $cond: [{ $gte: ["$average_rating", 4.0] }, { $multiply: ["$average_rating", 0.5] }, 0] },
          // Sales velocity (recent sales boost)
          { $multiply: [{ $ifNull: ["$sales_last_30_days", 0] }, 0.001] }
        ]
      },
      
      // Business priority scoring
      business_priority_score: {
        $add: [
          // Featured product boost
          { $cond: [{ $eq: ["$featured_product", true] }, 3.0, 0] },
          // New product launch boost (within 90 days)
          { 
            $cond: [
              { $gte: ["$launch_date", { $subtract: [new Date(), 90 * 24 * 60 * 60 * 1000] }] },
              2.0,
              0
            ]
          },
          // High margin product boost
          { $cond: [{ $gte: ["$profit_margin", 0.4] }, 1.5, 0] },
          // Brand partnership boost
          { $cond: [{ $in: ["$brand", ["Apple", "Sony", "Bose"]] }, 1.0, 0] }
        ]
      },
      
      // Availability and inventory scoring
      inventory_score: {
        $switch: {
          branches: [
            { case: { $gt: ["$inventory_quantity", 100] }, then: 2.0 },     // High stock
            { case: { $gt: ["$inventory_quantity", 50] }, then: 1.5 },      // Medium stock
            { case: { $gt: ["$inventory_quantity", 10] }, then: 1.0 },      // Low stock
            { case: { $gt: ["$inventory_quantity", 0] }, then: 0.5 }        // Very low stock
          ],
          default: 0 // Out of stock
        }
      },
      
      // Price competitiveness scoring
      price_competitiveness_score: {
        $cond: [
          { $and: [{ $gte: ["$price", "$category_price_min"] }, { $lte: ["$price", "$category_price_max"] }] },
          {
            $subtract: [
              2.0,
              { $divide: [{ $subtract: ["$price", "$category_price_min"] }, { $subtract: ["$category_price_max", "$category_price_min"] }] }
            ]
          },
          0
        ]
      },
      
      // Search term match quality scoring
      search_quality_score: {
        $add: [
          // Exact phrase match bonus
          { $cond: [{ $regexMatch: { input: { $toLower: "$product_name" }, regex: "premium wireless noise cancelling headphones" } }, 5.0, 0] },
          // Individual term matches in title
          { $cond: [{ $regexMatch: { input: { $toLower: "$product_name" }, regex: "premium" } }, 1.0, 0] },
          { $cond: [{ $regexMatch: { input: { $toLower: "$product_name" }, regex: "wireless" } }, 1.0, 0] },
          { $cond: [{ $regexMatch: { input: { $toLower: "$product_name" }, regex: "noise cancelling" } }, 2.0, 0] },
          { $cond: [{ $regexMatch: { input: { $toLower: "$product_name" }, regex: "headphones" } }, 1.0, 0] }
        ]
      },
      
      // User behavior scoring (if available)
      user_behavior_score: {
        $add: [
          // Click-through rate boost
          { $multiply: [{ $ifNull: ["$search_ctr", 0] }, 3.0] },
          // Conversion rate boost
          { $multiply: [{ $ifNull: ["$conversion_rate", 0] }, 5.0] },
          // View-to-purchase rate
          { $multiply: [{ $ifNull: ["$view_to_purchase_rate", 0] }, 4.0] }
        ]
      },
      
      // Calculate final composite score
      final_search_score: {
        $add: [
          { $multiply: ["$text_relevance", 4.0] },           // Text relevance (40% weight)
          { $multiply: ["$popularity_score", 2.0] },         // Popularity (20% weight)
          { $multiply: ["$business_priority_score", 1.5] },  // Business priority (15% weight)
          { $multiply: ["$inventory_score", 1.0] },          // Inventory (10% weight)
          { $multiply: ["$price_competitiveness_score", 0.75] }, // Price (7.5% weight)
          { $multiply: ["$search_quality_score", 0.5] },     // Search quality (5% weight)
          { $multiply: ["$user_behavior_score", 0.25] }      // User behavior (2.5% weight)
        ]
      }
    }
  },
  
  // Stage 3: Sort by final score and apply business rules
  {
    $sort: {
      final_search_score: -1,
      inventory_quantity: -1,  // Secondary sort for tied scores
      average_rating: -1       // Tertiary sort
    }
  },
  
  // Stage 4: Add search result metadata for analytics
  {
    $addFields: {
      search_result_metadata: {
        query_timestamp: new Date(),
        scoring_breakdown: {
          text_relevance: "$text_relevance",
          popularity_score: "$popularity_score",
          business_priority_score: "$business_priority_score",
          inventory_score: "$inventory_score",
          price_competitiveness_score: "$price_competitiveness_score",
          search_quality_score: "$search_quality_score",
          user_behavior_score: "$user_behavior_score",
          final_score: "$final_search_score"
        },
        result_position: { $add: [{ $indexOfArray: [{ $map: { input: "$$ROOT", as: "doc", in: "$$doc._id" } }, "$_id"] }, 1] }
      }
    }
  },
  
  // Stage 5: Project final search results
  {
    $project: {
      product_id: 1,
      product_name: 1,
      brand: 1,
      model: 1,
      price: 1,
      average_rating: 1,
      review_count: 1,
      inventory_quantity: 1,
      product_images: { $slice: ["$images", 3] }, // Limit images for performance
      key_features: { $slice: ["$features", 5] }, // Top 5 features
      final_search_score: 1,
      search_result_metadata: 1,
      
      // Add highlighted content for search results display
      highlighted_content: {
        title_highlight: {
          $replaceAll: {
            input: "$product_name",
            find: { $regex: "(premium|wireless|noise cancelling|headphones)", $options: "i" },
            replacement: "<mark>$1</mark>"
          }
        },
        description_snippet: {
          $substr: ["$short_description", 0, 150]
        }
      }
    }
  },
  
  { $limit: 20 }
])
```

### Personalized Search Ranking

Implement user-specific search ranking based on behavior and preferences:

```javascript
// Personalized search implementation
async function performPersonalizedSearch(userId, searchQuery, options = {}) {
  // Get user profile and search history
  const userProfile = await db.user_profiles.findOne({ user_id: userId });
  const searchHistory = await db.search_history.find({ 
    user_id: userId 
  }).sort({ timestamp: -1 }).limit(100).toArray();
  
  // Extract user preferences from history
  const userPreferences = {
    preferred_brands: extractPreferredBrands(searchHistory),
    preferred_categories: extractPreferredCategories(searchHistory),
    price_range_preference: calculatePriceRangePreference(searchHistory),
    feature_preferences: extractFeaturePreferences(searchHistory),
    search_patterns: analyzeSearchPatterns(searchHistory)
  };
  
  return await db.products.aggregate([
    // Stage 1: Text search
    {
      $match: {
        $text: {
          $search: searchQuery,
          $caseSensitive: false
        }
      }
    },
    
    // Stage 2: Add personalization scoring
    {
      $addFields: {
        base_text_score: { $meta: "textScore" },
        
        // Personalization factors
        personalization_score: {
          $add: [
            // Brand preference boost
            {
              $cond: [
                { $in: ["$brand", userPreferences.preferred_brands] },
                2.0,
                0
              ]
            },
            // Category preference boost
            {
              $cond: [
                { $in: ["$category", userPreferences.preferred_categories] },
                1.5,
                0
              ]
            },
            // Price range compatibility
            {
              $cond: [
                {
                  $and: [
                    { $gte: ["$price", userPreferences.price_range_preference.min] },
                    { $lte: ["$price", userPreferences.price_range_preference.max] }
                  ]
                },
                1.0,
                -0.5
              ]
            },
            // Feature preference alignment
            {
              $size: {
                $setIntersection: [
                  "$key_features",
                  userPreferences.feature_preferences
                ]
              }
            }
          ]
        },
        
        // Demographic targeting (if applicable)
        demographic_score: {
          $add: [
            // Age group targeting
            {
              $cond: [
                { $in: [userProfile.age_group, "$target_demographics.age_groups"] },
                0.5,
                0
              ]
            },
            // Interest targeting
            {
              $multiply: [
                {
                  $size: {
                    $setIntersection: [
                      userProfile.interests,
                      "$target_demographics.interests"
                    ]
                  }
                },
                0.1
              ]
            }
          ]
        },
        
        // Calculate personalized final score
        personalized_final_score: {
          $add: [
            { $multiply: [{ $meta: "textScore" }, 3.0] },
            { $multiply: ["$personalization_score", 2.0] },
            "$demographic_score"
          ]
        }
      }
    },
    
    // Stage 3: Sort by personalized score
    {
      $sort: {
        personalized_final_score: -1,
        average_rating: -1,
        review_count: -1
      }
    },
    
    // Stage 4: Log search event for future personalization
    {
      $addFields: {
        search_event: {
          user_id: userId,
          search_query: searchQuery,
          timestamp: new Date(),
          personalization_applied: true
        }
      }
    },
    
    { $limit: options.limit || 20 }
  ]).toArray();
}

// Helper functions for personalization
function extractPreferredBrands(searchHistory) {
  const brandCounts = {};
  searchHistory.forEach(search => {
    if (search.clicked_products) {
      search.clicked_products.forEach(product => {
        brandCounts[product.brand] = (brandCounts[product.brand] || 0) + 1;
      });
    }
  });
  return Object.keys(brandCounts)
    .sort((a, b) => brandCounts[b] - brandCounts[a])
    .slice(0, 5);
}

function calculatePriceRangePreference(searchHistory) {
  const prices = [];
  searchHistory.forEach(search => {
    if (search.purchased_products) {
      search.purchased_products.forEach(product => {
        prices.push(product.price);
      });
    }
  });
  
  if (prices.length === 0) return { min: 0, max: 1000 };
  
  prices.sort((a, b) => a - b);
  return {
    min: Math.max(0, prices[Math.floor(prices.length * 0.25)] * 0.8),
    max: prices[Math.floor(prices.length * 0.75)] * 1.2
  };
}
```

## Performance Optimization Strategies

### Search Index Optimization

Optimize text indexes for different search patterns and data access requirements:

```javascript
// Performance-optimized index strategies for different search scenarios

// Strategy 1: High-frequency, simple searches (e-commerce product search)
// Optimized for speed over comprehensive coverage
db.products_fast_search.createIndex({
  product_name: "text",
  brand: "text",
  category: "text"
}, {
  weights: {
    product_name: 10,
    brand: 8,
    category: 5
  },
  name: "fast_product_search",
  sparse: true,  // Only index documents with text fields
  background: true,
  textIndexVersion: 3
});

// Strategy 2: Comprehensive content search (documentation, blogs)
// Optimized for relevance over speed
db.content_comprehensive_search.createIndex({
  title: "text",
  content: "text",
  tags: "text",
  category: "text",
  author: "text",
  "metadata.keywords": "text"
}, {
  weights: {
    title: 15,
    "metadata.keywords": 10,
    tags: 8,
    category: 6,
    author: 4,
    content: 3
  },
  name: "comprehensive_content_search",
  default_language: "english",
  language_override: "content_language",
  textIndexVersion: 3
});

// Strategy 3: Multi-language optimized search
// Separate indexes per language for optimal performance
const languages = ['english', 'spanish', 'french', 'german', 'italian'];

languages.forEach(lang => {
  db.multilingual_content.createIndex({
    [`title.${lang}`]: "text",
    [`content.${lang}`]: "text",
    [`summary.${lang}`]: "text",
    global_tags: "text"
  }, {
    weights: {
      [`title.${lang}`]: 12,
      [`summary.${lang}`]: 8,
      [`content.${lang}`]: 5,
      global_tags: 6
    },
    name: `search_${lang}`,
    default_language: lang,
    partialFilterExpression: { primary_language: lang },
    background: true
  });
});

// Strategy 4: Compound indexes for filtered searches
// Combine text search with common filter conditions
db.products_filtered_search.createIndex({
  category: 1,
  price: 1,
  availability_status: 1,
  product_name: "text",
  description: "text"
}, {
  weights: {
    product_name: 10,
    description: 5
  },
  name: "filtered_product_search"
});

// Performance monitoring for search indexes
async function analyzeSearchPerformance() {
  // Get index statistics
  const indexStats = await db.products.aggregate([
    { $indexStats: {} },
    {
      $match: {
        name: { $regex: /.*search.*/ } // Focus on search indexes
      }
    },
    {
      $project: {
        name: 1,
        accesses: "$accesses.ops",
        since: "$accesses.since"
      }
    }
  ]).toArray();
  
  console.log("Search Index Performance:", indexStats);
  
  // Analyze slow search queries
  const slowQueries = await db.system.profile.find({
    "command.aggregate": { $exists: true },
    "command.pipeline.0.$match.$text": { $exists: true },
    millis: { $gt: 100 } // Queries taking longer than 100ms
  }).sort({ ts: -1 }).limit(10).toArray();
  
  console.log("Slow Search Queries:", slowQueries);
  
  return { indexStats, slowQueries };
}
```

### Search Result Caching Strategies

Implement intelligent caching for frequently accessed search results:

```javascript
// Advanced search result caching implementation
class SearchResultCache {
  constructor(cacheConfig = {}) {
    this.cacheConfig = {
      defaultTTL: cacheConfig.defaultTTL || 300, // 5 minutes
      maxCacheSize: cacheConfig.maxCacheSize || 10000,
      popularQueryTTL: cacheConfig.popularQueryTTL || 900, // 15 minutes for popular queries
      personalizedTTL: cacheConfig.personalizedTTL || 60, // 1 minute for personalized results
      ...cacheConfig
    };
    this.cache = new Map();
    this.queryFrequency = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }
  
  // Generate cache key considering all search factors
  generateCacheKey(searchParams) {
    const {
      query,
      filters,
      sort,
      limit,
      userId,
      language = 'english',
      personalized = false
    } = searchParams;
    
    const keyComponents = [
      `q:${query}`,
      `f:${JSON.stringify(filters || {})}`,
      `s:${JSON.stringify(sort || {})}`,
      `l:${limit || 20}`,
      `lang:${language}`
    ];
    
    if (personalized && userId) {
      keyComponents.push(`u:${userId}`);
    }
    
    return keyComponents.join('|');
  }
  
  // Determine appropriate TTL based on query characteristics
  calculateTTL(searchParams, queryFrequency = 0) {
    const { personalized, filters } = searchParams;
    
    // Personalized searches have shorter TTL
    if (personalized) {
      return this.cacheConfig.personalizedTTL;
    }
    
    // Popular queries get longer TTL
    if (queryFrequency > 10) {
      return this.cacheConfig.popularQueryTTL;
    }
    
    // Filtered searches (more specific) get longer TTL
    if (filters && Object.keys(filters).length > 0) {
      return this.cacheConfig.defaultTTL * 1.5;
    }
    
    return this.cacheConfig.defaultTTL;
  }
  
  // Get cached search results
  async get(searchParams) {
    const cacheKey = this.generateCacheKey(searchParams);
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      this.cacheStats.hits++;
      
      // Update query frequency for cache optimization
      const currentFreq = this.queryFrequency.get(cacheKey) || 0;
      this.queryFrequency.set(cacheKey, currentFreq + 1);
      
      return {
        results: cached.data,
        cached: true,
        cacheAge: Date.now() - cached.createdAt
      };
    }
    
    this.cacheStats.misses++;
    return null;
  }
  
  // Store search results in cache
  async set(searchParams, results) {
    const cacheKey = this.generateCacheKey(searchParams);
    const queryFreq = this.queryFrequency.get(cacheKey) || 0;
    const ttl = this.calculateTTL(searchParams, queryFreq);
    
    // Cache size management
    if (this.cache.size >= this.cacheConfig.maxCacheSize) {
      this.evictLeastUsed();
    }
    
    const cacheEntry = {
      data: results,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttl * 1000),
      accessCount: 1,
      lastAccessed: Date.now(),
      queryFrequency: queryFreq
    };
    
    this.cache.set(cacheKey, cacheEntry);
    this.queryFrequency.set(cacheKey, queryFreq + 1);
  }
  
  // Evict least recently used entries when cache is full
  evictLeastUsed() {
    let oldestKey = null;
    let oldestAccess = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.cacheStats.evictions++;
    }
  }
  
  // Invalidate cache entries when data changes
  async invalidatePattern(pattern) {
    const keysToDelete = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    return keysToDelete.length;
  }
  
  // Get cache performance statistics
  getStats() {
    const hitRate = this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses);
    
    return {
      ...this.cacheStats,
      hitRate: hitRate || 0,
      cacheSize: this.cache.size,
      popularQueries: Array.from(this.queryFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }
}

// Cached search implementation
const searchCache = new SearchResultCache({
  defaultTTL: 300,
  maxCacheSize: 5000,
  popularQueryTTL: 900,
  personalizedTTL: 60
});

async function performCachedSearch(searchParams) {
  const startTime = Date.now();
  
  // Try to get from cache first
  const cachedResult = await searchCache.get(searchParams);
  if (cachedResult) {
    return {
      ...cachedResult,
      searchTime: Date.now() - startTime,
      fromCache: true
    };
  }
  
  // Perform actual search
  const searchResults = await executeMongoSearch(searchParams);
  
  // Cache the results for future use
  await searchCache.set(searchParams, searchResults);
  
  return {
    results: searchResults,
    cached: false,
    searchTime: Date.now() - startTime,
    fromCache: false
  };
}

async function executeMongoSearch(searchParams) {
  const { query, filters = {}, sort = {}, limit = 20, userId, personalized = false } = searchParams;
  
  let pipeline = [
    {
      $match: {
        $and: [
          {
            $text: {
              $search: query,
              $caseSensitive: false,
              $diacriticSensitive: false
            }
          },
          filters
        ]
      }
    },
    {
      $addFields: {
        relevance_score: { $meta: "textScore" }
      }
    }
  ];
  
  // Add personalization if requested
  if (personalized && userId) {
    pipeline = await addPersonalizationStages(pipeline, userId);
  }
  
  // Add sorting and limiting
  pipeline.push(
    { $sort: { relevance_score: -1, ...sort } },
    { $limit: limit }
  );
  
  return await db.searchable_content.aggregate(pipeline).toArray();
}
```

## Real-Time Search and Autocomplete

### Autocomplete Implementation with Search Suggestions

Build responsive autocomplete functionality with search term suggestions:

```javascript
// Advanced autocomplete and search suggestion system
class SearchAutocompleteManager {
  constructor(config = {}) {
    this.config = {
      minQueryLength: config.minQueryLength || 2,
      maxSuggestions: config.maxSuggestions || 10,
      suggestionTypes: config.suggestionTypes || ['products', 'categories', 'brands'],
      includePopularSearches: config.includePopularSearches !== false,
      includeTrendingSearches: config.includeTrendingSearches !== false,
      ...config
    };
  }
  
  // Create autocomplete indexes for fast prefix matching
  async setupAutocompleteIndexes() {
    // Product name autocomplete
    await db.products.createIndex({
      product_name_autocomplete: "text"
    }, {
      name: "product_autocomplete",
      textIndexVersion: 3
    });
    
    // Add autocomplete fields to products
    await db.products.updateMany({}, [
      {
        $set: {
          product_name_autocomplete: {
            $concat: [
              "$product_name", " ",
              "$brand", " ",
              "$category", " ",
              { $reduce: {
                input: "$tags",
                initialValue: "",
                in: { $concat: ["$$value", " ", "$$this"] }
              }}
            ]
          },
          // Create searchable tokens
          search_tokens: {
            $split: [
              {
                $toLower: {
                  $concat: [
                    "$product_name", " ",
                    "$brand", " ",
                    "$category"
                  ]
                }
              },
              " "
            ]
          }
        }
      }
    ]);
    
    // Create prefix index for fast autocomplete
    await db.products.createIndex({
      "search_tokens": 1
    }, {
      name: "search_tokens_prefix"
    });
    
    // Popular searches collection for trending suggestions
    await db.popular_searches.createIndex({
      search_term: 1,
      frequency: -1,
      last_searched: -1
    });
  }
  
  // Generate autocomplete suggestions
  async generateAutocompleteSuggestions(partialQuery, options = {}) {
    const suggestions = {
      products: [],
      categories: [],
      brands: [],
      popular_searches: [],
      trending_searches: []
    };
    
    const queryRegex = new RegExp(partialQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    
    // Product suggestions
    if (this.config.suggestionTypes.includes('products')) {
      suggestions.products = await db.products.aggregate([
        {
          $match: {
            $or: [
              { product_name: queryRegex },
              { search_tokens: { $elemMatch: { $regex: queryRegex } } }
            ],
            availability_status: 'in_stock'
          }
        },
        {
          $addFields: {
            relevance_score: {
              $add: [
                // Exact name match gets highest score
                { $cond: [{ $regexMatch: { input: "$product_name", regex: `^${partialQuery}`, options: "i" } }, 10, 0] },
                // Name contains query
                { $cond: [{ $regexMatch: { input: "$product_name", regex: queryRegex } }, 5, 0] },
                // Popularity boost
                { $multiply: [{ $ln: { $add: ["$search_frequency", 1] } }, 0.1] },
                // Rating boost
                { $multiply: ["$average_rating", 0.5] }
              ]
            }
          }
        },
        { $sort: { relevance_score: -1, search_frequency: -1 } },
        { $limit: 5 },
        {
          $project: {
            suggestion: "$product_name",
            type: "product",
            category: 1,
            brand: 1,
            price: 1,
            image_url: { $arrayElemAt: ["$images", 0] },
            relevance_score: 1
          }
        }
      ]).toArray();
    }
    
    // Category suggestions
    if (this.config.suggestionTypes.includes('categories')) {
      suggestions.categories = await db.categories.aggregate([
        {
          $match: {
            $or: [
              { name: queryRegex },
              { aliases: { $elemMatch: { $regex: queryRegex } } }
            ],
            active: true
          }
        },
        {
          $addFields: {
            relevance_score: {
              $add: [
                { $cond: [{ $regexMatch: { input: "$name", regex: `^${partialQuery}`, options: "i" } }, 8, 0] },
                { $cond: [{ $regexMatch: { input: "$name", regex: queryRegex } }, 4, 0] },
                { $multiply: [{ $ln: { $add: ["$product_count", 1] } }, 0.1] }
              ]
            }
          }
        },
        { $sort: { relevance_score: -1, product_count: -1 } },
        { $limit: 3 },
        {
          $project: {
            suggestion: "$name",
            type: "category",
            product_count: 1,
            icon: 1,
            relevance_score: 1
          }
        }
      ]).toArray();
    }
    
    // Brand suggestions
    if (this.config.suggestionTypes.includes('brands')) {
      suggestions.brands = await db.brands.aggregate([
        {
          $match: {
            name: queryRegex,
            active: true
          }
        },
        {
          $addFields: {
            relevance_score: {
              $add: [
                { $cond: [{ $regexMatch: { input: "$name", regex: `^${partialQuery}`, options: "i" } }, 8, 0] },
                { $multiply: [{ $ln: { $add: ["$product_count", 1] } }, 0.1] },
                { $cond: [{ $eq: ["$featured", true] }, 2, 0] }
              ]
            }
          }
        },
        { $sort: { relevance_score: -1, product_count: -1 } },
        { $limit: 3 },
        {
          $project: {
            suggestion: "$name",
            type: "brand",
            product_count: 1,
            logo_url: 1,
            relevance_score: 1
          }
        }
      ]).toArray();
    }
    
    // Popular searches
    if (this.config.includePopularSearches) {
      suggestions.popular_searches = await db.popular_searches.find({
        search_term: queryRegex,
        frequency: { $gte: 5 }
      })
      .sort({ frequency: -1 })
      .limit(3)
      .project({
        suggestion: "$search_term",
        type: "popular_search",
        frequency: 1
      })
      .toArray();
    }
    
    // Trending searches (last 24 hours)
    if (this.config.includeTrendingSearches) {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      suggestions.trending_searches = await db.search_analytics.aggregate([
        {
          $match: {
            search_term: queryRegex,
            timestamp: { $gte: last24Hours }
          }
        },
        {
          $group: {
            _id: "$search_term",
            recent_frequency: { $sum: 1 },
            avg_result_clicks: { $avg: "$result_clicks" }
          }
        },
        { $sort: { recent_frequency: -1, avg_result_clicks: -1 } },
        { $limit: 2 },
        {
          $project: {
            suggestion: "$_id",
            type: "trending_search",
            recent_frequency: 1,
            avg_result_clicks: 1
          }
        }
      ]).toArray();
    }
    
    // Combine and rank all suggestions
    const allSuggestions = [
      ...suggestions.products,
      ...suggestions.categories,
      ...suggestions.brands,
      ...suggestions.popular_searches,
      ...suggestions.trending_searches
    ];
    
    // Sort by relevance and limit
    return allSuggestions
      .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
      .slice(0, this.config.maxSuggestions);
  }
  
  // Track search queries for improving autocomplete
  async trackSearchQuery(query, userId = null, results = []) {
    const searchRecord = {
      search_term: query.toLowerCase().trim(),
      user_id: userId,
      timestamp: new Date(),
      result_count: results.length,
      result_clicks: 0, // Will be updated when user clicks results
      session_id: generateSessionId()
    };
    
    // Insert search record
    await db.search_analytics.insertOne(searchRecord);
    
    // Update popular searches frequency
    await db.popular_searches.updateOne(
      { search_term: query.toLowerCase().trim() },
      {
        $inc: { frequency: 1 },
        $set: { last_searched: new Date() },
        $setOnInsert: { first_searched: new Date() }
      },
      { upsert: true }
    );
  }
  
  // Update search result click tracking
  async trackResultClick(searchId, productId, position) {
    await db.search_analytics.updateOne(
      { _id: searchId },
      {
        $inc: { result_clicks: 1 },
        $push: {
          clicked_results: {
            product_id: productId,
            position: position,
            timestamp: new Date()
          }
        }
      }
    );
  }
}

// Usage example
const autocompleteManager = new SearchAutocompleteManager({
  minQueryLength: 2,
  maxSuggestions: 8,
  suggestionTypes: ['products', 'categories', 'brands'],
  includePopularSearches: true,
  includeTrendingSearches: true
});

// API endpoint for autocomplete
async function autocompleteEndpoint(req, res) {
  const { q: query, limit = 8 } = req.query;
  
  if (!query || query.length < autocompleteManager.config.minQueryLength) {
    return res.json([]);
  }
  
  try {
    const suggestions = await autocompleteManager.generateAutocompleteSuggestions(query, { limit });
    
    res.json({
      query,
      suggestions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Autocomplete error:', error);
    res.status(500).json({ error: 'Autocomplete service unavailable' });
  }
}
```

## SQL Integration with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB's powerful text search capabilities:

```sql
-- QueryLeaf SQL syntax for MongoDB full-text search operations

-- Basic full-text search with SQL-familiar syntax
SELECT 
    product_id,
    product_name,
    brand,
    category,
    price,
    average_rating,
    review_count,
    -- QueryLeaf provides MongoDB's text score as a function
    MONGODB_TEXT_SCORE() as relevance_score
FROM products
WHERE FULL_TEXT_SEARCH('wireless bluetooth headphones')
  AND price BETWEEN 50 AND 300
  AND average_rating >= 4.0
  AND inventory_quantity > 0
ORDER BY MONGODB_TEXT_SCORE() DESC, average_rating DESC
LIMIT 20;

-- Advanced search with multiple text fields and weighting
WITH weighted_product_search AS (
  SELECT 
    product_id,
    product_name,
    brand,
    category,
    description,
    price,
    average_rating,
    review_count,
    inventory_quantity,
    
    -- MongoDB text search with field-specific weights
    FULL_TEXT_SEARCH('premium noise cancelling headphones', 
                     JSON_BUILD_OBJECT(
                       'product_name', 10,
                       'brand', 8,
                       'category', 6,
                       'description', 4,
                       'tags', 5
                     )) as text_match,
    
    MONGODB_TEXT_SCORE() as text_relevance_score,
    
    -- Business scoring calculations
    (
      (average_rating * 2) +
      (LN(review_count + 1) / 10) +
      CASE 
        WHEN featured_product = true THEN 5 
        ELSE 0 
      END +
      CASE 
        WHEN inventory_quantity > 100 THEN 2
        WHEN inventory_quantity > 10 THEN 1
        ELSE 0
      END
    ) as business_score,
    
    -- Combined scoring
    (MONGODB_TEXT_SCORE() * 3) + 
    (
      (average_rating * 2) +
      (LN(review_count + 1) / 10) +
      CASE WHEN featured_product = true THEN 5 ELSE 0 END
    ) as combined_score
    
  FROM products
  WHERE FULL_TEXT_SEARCH('premium noise cancelling headphones')
    AND price BETWEEN 100 AND 500
    AND average_rating >= 4.0
    AND inventory_quantity > 0
),

ranked_results AS (
  SELECT 
    *,
    ROW_NUMBER() OVER (ORDER BY combined_score DESC, average_rating DESC) as search_rank,
    
    -- Add search result highlighting
    REGEXP_REPLACE(product_name, '(premium|noise|cancelling|headphones)', '<mark>$1</mark>', 'gi') as highlighted_name,
    SUBSTRING(description, 1, 200) as description_snippet
    
  FROM weighted_product_search
)

SELECT 
  product_id,
  product_name,
  highlighted_name,
  brand,
  category,
  price,
  average_rating,
  review_count,
  description_snippet,
  text_relevance_score,
  business_score,
  combined_score,
  search_rank,
  
  -- Search result metadata
  CURRENT_TIMESTAMP as search_timestamp,
  'premium noise cancelling headphones' as search_query
  
FROM ranked_results
ORDER BY combined_score DESC
LIMIT 20;

-- Multi-language search with language-specific optimization
SELECT 
  document_id,
  title,
  content_summary,
  language,
  author,
  published_date,
  view_count,
  
  -- Language-aware full-text search
  CASE 
    WHEN language = 'english' THEN 
      FULL_TEXT_SEARCH('machine learning artificial intelligence', 
                       JSON_BUILD_OBJECT('language', 'english'))
    WHEN language = 'spanish' THEN 
      FULL_TEXT_SEARCH('aprendizaje automático inteligencia artificial',
                       JSON_BUILD_OBJECT('language', 'spanish'))
    WHEN language = 'french' THEN 
      FULL_TEXT_SEARCH('apprentissage automatique intelligence artificielle',
                       JSON_BUILD_OBJECT('language', 'french'))
    ELSE 
      FULL_TEXT_SEARCH('machine learning artificial intelligence',
                       JSON_BUILD_OBJECT('language', 'english'))
  END as language_search_match,
  
  MONGODB_TEXT_SCORE() as relevance_score,
  
  -- Language match boost
  CASE 
    WHEN language = 'english' THEN MONGODB_TEXT_SCORE() * 1.2
    ELSE MONGODB_TEXT_SCORE()
  END as language_boosted_score
  
FROM multilingual_documents
WHERE 
  CASE 
    WHEN language = 'english' THEN 
      FULL_TEXT_SEARCH('machine learning artificial intelligence',
                       JSON_BUILD_OBJECT('language', 'english'))
    WHEN language = 'spanish' THEN 
      FULL_TEXT_SEARCH('aprendizaje automático inteligencia artificial',
                       JSON_BUILD_OBJECT('language', 'spanish'))
    WHEN language = 'french' THEN 
      FULL_TEXT_SEARCH('apprentissage automatique intelligence artificielle',
                       JSON_BUILD_OBJECT('language', 'french'))
    ELSE false
  END
  AND published_date >= CURRENT_DATE - INTERVAL '1 year'
  AND document_status = 'published'
ORDER BY language_boosted_score DESC, view_count DESC
LIMIT 15;

-- Advanced e-commerce search with filters and faceting
WITH product_search_base AS (
  SELECT 
    p.product_id,
    p.product_name,
    p.brand,
    p.category,
    p.subcategory,
    p.price,
    p.average_rating,
    p.review_count,
    p.tags,
    pi.quantity_available,
    
    -- Full-text search with multiple terms
    FULL_TEXT_SEARCH('"wireless headphones" bluetooth premium', 
                     JSON_BUILD_OBJECT(
                       'product_name', 12,
                       'brand', 8,
                       'category', 6,
                       'tags', 5,
                       'description', 3
                     )) as search_match,
    
    MONGODB_TEXT_SCORE() as text_score,
    
    -- Calculate comprehensive relevance score
    (
      MONGODB_TEXT_SCORE() * 4 +                    -- Text relevance (40%)
      (p.average_rating * 2) +                      -- Rating influence (20%)
      (LN(p.review_count + 1) * 0.5) +             -- Review count (5%)
      CASE WHEN p.featured = true THEN 3 ELSE 0 END + -- Featured boost (3%)
      CASE 
        WHEN pi.quantity_available > 50 THEN 2
        WHEN pi.quantity_available > 10 THEN 1
        ELSE 0
      END +                                         -- Inventory boost (2%)
      CASE 
        WHEN p.brand IN ('Apple', 'Sony', 'Bose') THEN 1.5
        ELSE 0
      END                                          -- Premium brand boost (1.5%)
    ) as comprehensive_score
    
  FROM products p
  JOIN product_inventory pi ON p.product_id = pi.product_id
  WHERE FULL_TEXT_SEARCH('"wireless headphones" bluetooth premium')
    AND p.price BETWEEN 50 AND 400
    AND p.average_rating >= 3.5
    AND pi.quantity_available > 0
    AND p.status = 'active'
),

search_results_with_facets AS (
  SELECT 
    *,
    -- Generate search facets for filtering UI
    brand as brand_facet,
    category as category_facet,
    
    -- Price range facets
    CASE 
      WHEN price < 50 THEN 'Under $50'
      WHEN price < 100 THEN '$50-$99'
      WHEN price < 200 THEN '$100-$199'
      WHEN price < 300 THEN '$200-$299'
      ELSE '$300+'
    END as price_range_facet,
    
    -- Rating facets
    CASE 
      WHEN average_rating >= 4.5 THEN '4.5+ stars'
      WHEN average_rating >= 4.0 THEN '4.0+ stars'
      WHEN average_rating >= 3.5 THEN '3.5+ stars'
      ELSE '3.0+ stars'
    END as rating_facet,
    
    ROW_NUMBER() OVER (ORDER BY comprehensive_score DESC) as search_position
    
  FROM product_search_base
)

-- Main search results
SELECT 
  product_id,
  product_name,
  brand,
  category,
  price,
  average_rating,
  review_count,
  quantity_available,
  text_score,
  comprehensive_score,
  search_position,
  
  -- Add highlighted search terms
  REGEXP_REPLACE(product_name, '(wireless|headphones|bluetooth|premium)', '<strong>$1</strong>', 'gi') as highlighted_name,
  
  -- Search metadata
  JSON_BUILD_OBJECT(
    'search_query', '"wireless headphones" bluetooth premium',
    'search_timestamp', CURRENT_TIMESTAMP,
    'total_results', COUNT(*) OVER(),
    'search_facets', JSON_BUILD_OBJECT(
      'brand', brand_facet,
      'category', category_facet,
      'price_range', price_range_facet,
      'rating', rating_facet
    )
  ) as search_metadata
  
FROM search_results_with_facets
ORDER BY comprehensive_score DESC, average_rating DESC
LIMIT 20;

-- Search analytics and performance monitoring
WITH search_performance_analysis AS (
  SELECT 
    DATE_TRUNC('hour', search_timestamp) as search_hour,
    search_query,
    COUNT(*) as search_frequency,
    AVG(MONGODB_TEXT_SCORE()) as avg_relevance_score,
    AVG(search_response_time_ms) as avg_response_time,
    COUNT(DISTINCT user_id) as unique_searchers,
    
    -- Click-through analysis
    SUM(CASE WHEN result_clicked = true THEN 1 ELSE 0 END) as total_clicks,
    (SUM(CASE WHEN result_clicked = true THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)) * 100 as ctr_percentage,
    
    -- Popular result positions
    AVG(CASE WHEN result_clicked = true THEN result_position ELSE NULL END) as avg_clicked_position
    
  FROM search_analytics
  WHERE search_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', search_timestamp), search_query
  HAVING COUNT(*) >= 5  -- Only analyze queries with sufficient volume
),

search_optimization_insights AS (
  SELECT 
    search_query,
    SUM(search_frequency) as total_searches,
    AVG(avg_relevance_score) as overall_avg_relevance,
    AVG(avg_response_time) as overall_avg_response_time,
    AVG(ctr_percentage) as overall_ctr,
    AVG(avg_clicked_position) as overall_avg_clicked_position,
    
    -- Performance classification
    CASE 
      WHEN AVG(avg_response_time) > 500 THEN 'slow'
      WHEN AVG(avg_response_time) > 200 THEN 'moderate'
      ELSE 'fast'
    END as performance_classification,
    
    -- Relevance quality assessment
    CASE 
      WHEN AVG(ctr_percentage) > 15 THEN 'high_relevance'
      WHEN AVG(ctr_percentage) > 8 THEN 'medium_relevance'
      ELSE 'low_relevance'
    END as relevance_quality,
    
    -- Optimization recommendations
    CASE 
      WHEN AVG(avg_response_time) > 500 THEN 'index_optimization_needed'
      WHEN AVG(ctr_percentage) < 5 THEN 'search_algorithm_tuning_needed'
      WHEN AVG(avg_clicked_position) > 10 THEN 'ranking_improvement_needed'
      ELSE 'performing_well'
    END as optimization_recommendation
    
  FROM search_performance_analysis
  GROUP BY search_query
)

SELECT 
  search_query,
  total_searches,
  overall_avg_relevance,
  overall_avg_response_time,
  overall_ctr,
  overall_avg_clicked_position,
  performance_classification,
  relevance_quality,
  optimization_recommendation,
  
  -- Priority score for optimization efforts
  (
    CASE performance_classification 
      WHEN 'slow' THEN 40
      WHEN 'moderate' THEN 20
      ELSE 10
    END +
    CASE relevance_quality
      WHEN 'low_relevance' THEN 30
      WHEN 'medium_relevance' THEN 15
      ELSE 5
    END +
    (total_searches / 100)  -- Volume-based priority
  ) as optimization_priority_score
  
FROM search_optimization_insights
ORDER BY optimization_priority_score DESC, total_searches DESC;

-- QueryLeaf provides seamless MongoDB text search integration:
-- 1. FULL_TEXT_SEARCH() function with field weighting support
-- 2. MONGODB_TEXT_SCORE() for accessing MongoDB's text relevance scores
-- 3. Language-specific search configuration through JSON parameters
-- 4. Integration with standard SQL filtering, sorting, and aggregation
-- 5. Advanced search analytics and performance monitoring
-- 6. Familiar SQL syntax for complex multi-field text search operations
```

## Best Practices for Production Search Implementation

### Search Index Management and Optimization

Essential strategies for maintaining high-performance search in production:

1. **Index Strategy Planning**: Design text indexes based on actual query patterns and field importance
2. **Performance Monitoring**: Continuously monitor search performance and optimize slow queries
3. **Language Optimization**: Configure appropriate language analyzers and stemming for your content
4. **Relevance Tuning**: Regularly analyze search quality metrics and adjust scoring algorithms
5. **Caching Strategy**: Implement intelligent caching for frequently accessed search results
6. **Resource Management**: Monitor index size and query resource usage for capacity planning

### Search Quality and User Experience

Optimize search functionality for maximum user satisfaction:

1. **Relevance Quality**: Implement comprehensive relevance scoring that combines text matching with business metrics
2. **Search Analytics**: Track user search behavior to continuously improve search quality
3. **Autocomplete Performance**: Provide fast, relevant search suggestions with minimal latency
4. **Result Presentation**: Design search results with proper highlighting and metadata
5. **Faceted Search**: Enable users to refine searches with category, price, and attribute filters
6. **Search Personalization**: Customize search results based on user preferences and behavior

## Conclusion

MongoDB's full-text search capabilities provide comprehensive solutions for implementing production-grade search functionality directly within your database. The combination of powerful text indexing, sophisticated scoring algorithms, and advanced optimization strategies enables applications to deliver fast, relevant search experiences without the complexity of external search engines.

Key benefits of MongoDB full-text search include:

- **Performance Optimization**: Advanced indexing strategies and caching for high-volume search workloads
- **Relevance Intelligence**: Sophisticated scoring algorithms that combine text matching with business metrics
- **Multi-Language Support**: Built-in language analysis, stemming, and localization capabilities
- **Scalable Architecture**: Distributed search across sharded collections with automatic query routing
- **SQL Accessibility**: Familiar SQL-style search operations through QueryLeaf for approachable development
- **Production Readiness**: Comprehensive monitoring, analytics, and optimization tools for enterprise deployments

Whether you're building e-commerce product search, content discovery systems, or enterprise search applications, MongoDB's text search with QueryLeaf's familiar SQL interface provides the foundation for delivering exceptional search experiences that scale with your application's growth.

> **QueryLeaf Integration**: QueryLeaf seamlessly translates SQL full-text search operations into optimized MongoDB text queries. Advanced search features like field weighting, language-specific analysis, and relevance scoring are accessible through familiar SQL syntax, making sophisticated search functionality approachable for SQL-oriented development teams while leveraging MongoDB's powerful text search capabilities.

The combination of MongoDB's robust search engine with SQL-familiar query patterns makes it an ideal choice for applications requiring both powerful search capabilities and familiar database interaction patterns, ensuring your search functionality can evolve with your application's complexity and scale.