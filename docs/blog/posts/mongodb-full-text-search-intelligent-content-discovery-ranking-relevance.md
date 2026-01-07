---
title: "MongoDB Full-Text Search for Intelligent Content Discovery: Advanced Text Indexing, Ranking, and Relevance Scoring with SQL-Compatible Operations"
description: "Master MongoDB Full-Text Search for intelligent content discovery, document ranking, and relevance scoring. Learn advanced text indexing strategies, search optimization patterns, and SQL-familiar full-text operations for content management systems and knowledge bases."
date: 2025-01-06
tags: [mongodb, full-text-search, text-indexing, content-discovery, search-ranking, relevance-scoring, sql]
---

# MongoDB Full-Text Search for Intelligent Content Discovery: Advanced Text Indexing, Ranking, and Relevance Scoring with SQL-Compatible Operations

Modern applications require sophisticated full-text search capabilities to enable users to discover relevant content across large document collections, knowledge bases, and content management systems. Traditional database text search approaches often provide limited functionality, poor performance with large datasets, and insufficient relevance ranking mechanisms that fail to deliver the intelligent search experiences users expect.

MongoDB Full-Text Search provides native support for intelligent text indexing, advanced relevance scoring, and high-performance text queries with comprehensive linguistic features including stemming, stop word filtering, and multi-language support. Unlike basic SQL LIKE operations or external search engine integrations that require complex infrastructure management, MongoDB's Full-Text Search delivers enterprise-grade search capabilities while maintaining unified data access patterns and transactional consistency.

## The Traditional Text Search Challenge

Building effective text search with conventional database approaches creates significant performance and functionality limitations:

```sql
-- Traditional PostgreSQL text search - limited functionality and performance issues

-- Basic text table with conventional indexing
CREATE TABLE documents (
    document_id BIGSERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    author VARCHAR(200),
    category VARCHAR(100),
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata for search optimization
    document_language VARCHAR(10) DEFAULT 'en',
    content_type VARCHAR(50),
    word_count INTEGER,
    
    -- Search optimization fields
    search_vector TSVECTOR,
    title_search_vector TSVECTOR
);

-- Traditional full-text indexes (limited configuration options)
CREATE INDEX idx_documents_search_vector ON documents USING GIN(search_vector);
CREATE INDEX idx_documents_title_search ON documents USING GIN(title_search_vector);
CREATE INDEX idx_documents_category_search ON documents (category, search_vector) USING GIN;

-- Triggers for maintaining search vectors
CREATE OR REPLACE FUNCTION update_document_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector(coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector(coalesce(NEW.content, '')), 'B') ||
        setweight(to_tsvector(coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
    
    NEW.title_search_vector := to_tsvector(coalesce(NEW.title, ''));
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_search_vector
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_document_search_vector();

-- Complex text search query with limited ranking capabilities
WITH search_query AS (
    SELECT 
        to_tsquery($1) as query_vector,  -- User search query
        $1 as original_query
),

basic_text_search AS (
    SELECT 
        d.document_id,
        d.title,
        d.content,
        d.author,
        d.category,
        d.tags,
        d.created_at,
        d.word_count,
        sq.original_query,
        
        -- Basic relevance scoring (limited functionality)
        ts_rank(d.search_vector, sq.query_vector) as basic_rank,
        ts_rank_cd(d.search_vector, sq.query_vector) as cover_density_rank,
        
        -- Title match scoring
        ts_rank(d.title_search_vector, sq.query_vector) as title_rank,
        
        -- Query matching analysis
        ts_headline(d.content, sq.query_vector, 'MaxWords=30, MinWords=5') as content_highlight,
        ts_headline(d.title, sq.query_vector) as title_highlight,
        
        -- Manual relevance factors (limited sophistication)
        CASE 
            WHEN d.category = $2 THEN 0.2  -- Category boost parameter
            ELSE 0.0 
        END as category_boost,
        
        CASE 
            WHEN d.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 0.1
            WHEN d.created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 0.05
            ELSE 0.0
        END as recency_boost,
        
        -- Tag matching (manual implementation)
        CASE 
            WHEN d.tags && string_to_array($3, ',') THEN 0.1  -- Tag filter parameter
            ELSE 0.0
        END as tag_boost
        
    FROM documents d
    CROSS JOIN search_query sq
    WHERE d.search_vector @@ sq.query_vector
),

enhanced_ranking AS (
    SELECT 
        bts.*,
        
        -- Combined relevance scoring (manual calculation)
        (
            basic_rank * 0.4 +                    -- Primary text relevance
            title_rank * 0.3 +                    -- Title match importance
            category_boost +                      -- Category relevance
            recency_boost +                       -- Time decay factor
            tag_boost +                          -- Tag matching
            
            -- Word count normalization (rough approximation)
            CASE 
                WHEN word_count BETWEEN 300 AND 2000 THEN 0.1
                WHEN word_count BETWEEN 100 AND 300 THEN 0.05
                ELSE 0.0
            END
        ) as composite_relevance_score,
        
        -- Search quality indicators (limited analysis)
        CASE 
            WHEN basic_rank > 0.1 AND title_rank > 0.1 THEN 'high_relevance'
            WHEN basic_rank > 0.05 THEN 'medium_relevance'
            ELSE 'low_relevance'
        END as relevance_category,
        
        -- Content analysis (basic)
        LENGTH(content) as content_length,
        ROUND((LENGTH(content) / NULLIF(word_count, 0))::numeric, 1) as avg_word_length
        
    FROM basic_text_search bts
),

search_results AS (
    SELECT 
        er.*,
        
        -- Result ranking and grouping
        ROW_NUMBER() OVER (ORDER BY composite_relevance_score DESC) as search_rank,
        
        -- Diversity scoring (limited implementation)
        ROW_NUMBER() OVER (
            PARTITION BY category 
            ORDER BY composite_relevance_score DESC
        ) as category_rank,
        
        -- Search metadata
        CURRENT_TIMESTAMP as search_performed_at,
        original_query as search_query
        
    FROM enhanced_ranking er
    WHERE composite_relevance_score > 0.01  -- Minimum relevance threshold
)

SELECT 
    document_id,
    title,
    CASE 
        WHEN LENGTH(content) > 300 THEN LEFT(content, 300) || '...'
        ELSE content
    END as content_preview,
    author,
    category,
    tags,
    TO_CHAR(created_at, 'YYYY-MM-DD') as published_date,
    
    -- Relevance and ranking metrics
    ROUND(composite_relevance_score::numeric, 4) as relevance_score,
    search_rank,
    relevance_category,
    
    -- Search highlights (limited formatting)
    title_highlight,
    content_highlight,
    
    -- Content characteristics
    word_count,
    content_length,
    
    -- Quality indicators
    CASE 
        WHEN word_count >= 500 AND composite_relevance_score > 0.1 THEN 'comprehensive_match'
        WHEN title_rank > 0.2 THEN 'title_focused_match'
        WHEN basic_rank > 0.1 THEN 'content_focused_match'
        ELSE 'partial_match'
    END as match_quality,
    
    -- Search context
    search_performed_at,
    search_query

FROM search_results
WHERE 
    -- Result filtering and diversity constraints
    search_rank <= 50                           -- Limit total results
    AND category_rank <= 5                      -- Max per category for diversity
    AND composite_relevance_score >= 0.02       -- Quality threshold
    
ORDER BY composite_relevance_score DESC, search_rank
LIMIT 20;

-- Problems with traditional text search approaches:
-- 1. Limited linguistic processing and language-specific features
-- 2. Complex manual relevance scoring with poor ranking algorithms
-- 3. Expensive full-text index maintenance and update overhead
-- 4. Limited support for fuzzy matching and typo tolerance
-- 5. Poor performance with large document collections and complex queries
-- 6. No built-in support for search analytics and query optimization
-- 7. Difficult integration of business logic into ranking algorithms
-- 8. Limited faceted search and filtering capabilities
-- 9. Complex infrastructure required for distributed search scenarios
-- 10. Manual implementation of search features like auto-complete and suggestions
```

MongoDB Full-Text Search provides native intelligent text search capabilities:

```javascript
// MongoDB Full-Text Search - native intelligent content discovery with advanced ranking
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('content_management_platform');

// Advanced Full-Text Search Management System
class MongoFullTextSearchManager {
  constructor(db, searchConfig = {}) {
    this.db = db;
    this.config = {
      // Text search configuration
      enableFullTextSearch: searchConfig.enableFullTextSearch !== false,
      defaultLanguage: searchConfig.defaultLanguage || 'en',
      supportedLanguages: searchConfig.supportedLanguages || ['en', 'es', 'fr', 'de'],
      
      // Index configuration
      textIndexWeights: searchConfig.textIndexWeights || {
        title: 10,
        content: 5,
        tags: 8,
        category: 3,
        description: 6
      },
      
      // Search optimization
      enableFuzzyMatching: searchConfig.enableFuzzyMatching !== false,
      enableAutoComplete: searchConfig.enableAutoComplete !== false,
      defaultSearchLimit: searchConfig.defaultSearchLimit || 20,
      maxSearchResults: searchConfig.maxSearchResults || 100,
      
      // Relevance scoring
      enableAdvancedScoring: searchConfig.enableAdvancedScoring !== false,
      scoringWeights: searchConfig.scoringWeights || {
        textScore: 0.4,
        titleBoost: 0.3,
        recencyFactor: 0.1,
        popularityBoost: 0.1,
        categoryBoost: 0.1
      },
      
      // Performance optimization
      enableSearchCache: searchConfig.enableSearchCache !== false,
      enableSearchAnalytics: searchConfig.enableSearchAnalytics !== false,
      
      ...searchConfig
    };
    
    // Collection references
    this.collections = {
      documents: db.collection('documents'),
      searchQueries: db.collection('search_queries'),
      searchAnalytics: db.collection('search_analytics'),
      searchSuggestions: db.collection('search_suggestions')
    };
    
    this.initializeFullTextSearch();
  }

  async initializeFullTextSearch() {
    console.log('Initializing MongoDB Full-Text Search system...');
    
    try {
      // Create optimized text indexes
      await this.createTextIndexes();
      
      // Setup search analytics infrastructure
      await this.setupSearchAnalytics();
      
      // Initialize auto-complete and suggestions
      await this.setupSearchSuggestions();
      
      console.log('Full-Text Search system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing full-text search:', error);
      throw error;
    }
  }

  async createTextIndexes() {
    console.log('Creating optimized full-text search indexes...');
    
    const documentsCollection = this.collections.documents;
    
    try {
      // Comprehensive text index with weighted fields
      await documentsCollection.createIndex(
        {
          title: 'text',
          content: 'text',
          tags: 'text',
          category: 'text',
          description: 'text',
          author: 'text'
        },
        {
          name: 'comprehensive_text_index',
          weights: this.config.textIndexWeights,
          default_language: this.config.defaultLanguage,
          language_override: 'language',
          background: true
        }
      );

      // Category-specific text index for targeted searches
      await documentsCollection.createIndex(
        {
          category: 1,
          title: 'text',
          content: 'text'
        },
        {
          name: 'category_text_index',
          weights: {
            title: 10,
            content: 5
          },
          background: true
        }
      );

      // Supporting indexes for search optimization
      await documentsCollection.createIndexes([
        {
          key: { category: 1, createdAt: -1 },
          name: 'category_date_index',
          background: true
        },
        {
          key: { author: 1, createdAt: -1 },
          name: 'author_date_index', 
          background: true
        },
        {
          key: { tags: 1, createdAt: -1 },
          name: 'tags_date_index',
          background: true
        },
        {
          key: { 'analytics.viewCount': -1 },
          name: 'popularity_index',
          background: true
        }
      ]);

      console.log('✅ Full-text search indexes created successfully');
      
    } catch (error) {
      console.error('Error creating text indexes:', error);
      throw error;
    }
  }

  async performIntelligentTextSearch(searchQuery, options = {}) {
    console.log(`Performing intelligent text search for: "${searchQuery}"`);
    
    const searchStartTime = Date.now();
    
    try {
      const searchConfig = {
        query: searchQuery,
        language: options.language || this.config.defaultLanguage,
        categoryFilter: options.categoryFilter,
        authorFilter: options.authorFilter,
        dateRange: options.dateRange,
        tagFilter: options.tagFilter,
        limit: Math.min(options.limit || this.config.defaultSearchLimit, this.config.maxSearchResults),
        enableFuzzy: options.enableFuzzy !== false,
        sortBy: options.sortBy || 'relevance',
        includeHighlights: options.includeHighlights !== false,
        enableFacets: options.enableFacets !== false
      };

      // Build comprehensive search aggregation pipeline
      const searchPipeline = [
        // Stage 1: Text search with scoring
        {
          $match: {
            $text: {
              $search: searchConfig.query,
              $language: searchConfig.language,
              ...(searchConfig.enableFuzzy && { 
                $caseSensitive: false,
                $diacriticSensitive: false 
              })
            },
            
            // Apply filters
            ...(searchConfig.categoryFilter && { 
              category: { $in: Array.isArray(searchConfig.categoryFilter) ? searchConfig.categoryFilter : [searchConfig.categoryFilter] }
            }),
            ...(searchConfig.authorFilter && { author: searchConfig.authorFilter }),
            ...(searchConfig.dateRange && {
              createdAt: {
                $gte: new Date(searchConfig.dateRange.start),
                $lte: new Date(searchConfig.dateRange.end)
              }
            }),
            ...(searchConfig.tagFilter && { 
              tags: { $in: Array.isArray(searchConfig.tagFilter) ? searchConfig.tagFilter : [searchConfig.tagFilter] }
            }),
            
            // Quality filters
            isPublished: true,
            isActive: { $ne: false }
          }
        },

        // Stage 2: Add text score and metadata
        {
          $addFields: {
            textScore: { $meta: 'textScore' },
            searchMetadata: {
              query: searchConfig.query,
              searchTime: new Date(),
              language: searchConfig.language
            }
          }
        },

        // Stage 3: Enhanced relevance scoring
        {
          $addFields: {
            // Advanced relevance calculation
            relevanceScore: {
              $add: [
                // Primary text score component
                {
                  $multiply: [
                    { $meta: 'textScore' },
                    this.config.scoringWeights.textScore
                  ]
                },
                
                // Title boost (if query terms appear in title)
                {
                  $cond: [
                    {
                      $regexMatch: {
                        input: { $toLower: '$title' },
                        regex: { $toLower: searchConfig.query },
                        options: 'i'
                      }
                    },
                    this.config.scoringWeights.titleBoost,
                    0
                  ]
                },
                
                // Recency factor (newer content gets boost)
                {
                  $multiply: [
                    {
                      $max: [
                        0,
                        {
                          $subtract: [
                            1,
                            {
                              $divide: [
                                { $subtract: [new Date(), '$createdAt'] },
                                365 * 24 * 60 * 60 * 1000  // 1 year in milliseconds
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    this.config.scoringWeights.recencyFactor
                  ]
                },
                
                // Popularity boost (view count factor)
                {
                  $multiply: [
                    {
                      $min: [
                        1,
                        {
                          $divide: [
                            { $ifNull: ['$analytics.viewCount', 0] },
                            1000
                          ]
                        }
                      ]
                    },
                    this.config.scoringWeights.popularityBoost
                  ]
                },
                
                // Category match boost
                {
                  $cond: [
                    { $in: ['$category', searchConfig.categoryFilter || []] },
                    this.config.scoringWeights.categoryBoost,
                    0
                  ]
                }
              ]
            },
            
            // Content quality indicators
            contentQuality: {
              $switch: {
                branches: [
                  {
                    case: { 
                      $and: [
                        { $gte: ['$wordCount', 1000] },
                        { $gte: [{ $ifNull: ['$analytics.averageRating', 0] }, 4] }
                      ]
                    },
                    then: 'high_quality'
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$wordCount', 300] },
                        { $gte: [{ $ifNull: ['$analytics.averageRating', 0] }, 3] }
                      ]
                    },
                    then: 'good_quality'
                  },
                  {
                    case: { $gte: ['$wordCount', 100] },
                    then: 'basic_quality'
                  }
                ],
                default: 'short_content'
              }
            },
            
            // Search match type classification
            matchType: {
              $switch: {
                branches: [
                  {
                    case: {
                      $regexMatch: {
                        input: { $toLower: '$title' },
                        regex: { $toLower: searchConfig.query },
                        options: 'i'
                      }
                    },
                    then: 'title_match'
                  },
                  {
                    case: { $gte: [{ $meta: 'textScore' }, 2.0] },
                    then: 'strong_content_match'
                  },
                  {
                    case: { $gte: [{ $meta: 'textScore' }, 1.0] },
                    then: 'good_content_match'
                  }
                ],
                default: 'weak_content_match'
              }
            }
          }
        },

        // Stage 4: Content analysis and enrichment
        {
          $lookup: {
            from: 'user_interactions',
            let: { docId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$documentId', '$$docId'] },
                      { $gte: ['$interactionDate', { $subtract: [new Date(), 30 * 24 * 60 * 60 * 1000] }] }
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  recentViews: { $sum: 1 },
                  averageRating: { $avg: '$rating' },
                  uniqueUsers: { $addToSet: '$userId' }
                }
              }
            ],
            as: 'recentEngagement'
          }
        },

        // Stage 5: Related content discovery
        {
          $lookup: {
            from: 'documents',
            let: {
              currentCategory: '$category',
              currentTags: '$tags',
              currentId: '$_id'
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $ne: ['$_id', '$$currentId'] },
                      { $eq: ['$isPublished', true] },
                      {
                        $or: [
                          { $eq: ['$category', '$$currentCategory'] },
                          { $gt: [{ $size: { $setIntersection: ['$tags', '$$currentTags'] } }, 0] }
                        ]
                      }
                    ]
                  }
                }
              },
              {
                $sample: { size: 3 }
              },
              {
                $project: {
                  _id: 1,
                  title: 1,
                  category: 1
                }
              }
            ],
            as: 'relatedContent'
          }
        },

        // Stage 6: Generate search highlights
        ...(searchConfig.includeHighlights ? [
          {
            $addFields: {
              searchHighlights: {
                title: {
                  $regexFind: {
                    input: '$title',
                    regex: searchConfig.query,
                    options: 'i'
                  }
                },
                contentSnippet: {
                  $let: {
                    vars: {
                      contentLower: { $toLower: '$content' },
                      queryLower: { $toLower: searchConfig.query }
                    },
                    in: {
                      $cond: [
                        { $gt: [{ $indexOfCP: ['$$contentLower', '$$queryLower'] }, -1] },
                        {
                          $let: {
                            vars: {
                              matchIndex: { $indexOfCP: ['$$contentLower', '$$queryLower'] },
                              snippetStart: {
                                $max: [
                                  0,
                                  { $subtract: [{ $indexOfCP: ['$$contentLower', '$$queryLower'] }, 50] }
                                ]
                              }
                            },
                            in: {
                              $concat: [
                                { $cond: [{ $gt: ['$$snippetStart', 0] }, '...', ''] },
                                { $substrCP: ['$content', '$$snippetStart', 200] },
                                '...'
                              ]
                            }
                          }
                        },
                        { $substrCP: ['$content', 0, 200] }
                      ]
                    }
                  }
                }
              }
            }
          }
        ] : []),

        // Stage 7: Final enrichment and formatting
        {
          $addFields: {
            // Engagement metrics
            engagementMetrics: {
              $cond: [
                { $gt: [{ $size: '$recentEngagement' }, 0] },
                {
                  recentViews: { $arrayElemAt: ['$recentEngagement.recentViews', 0] },
                  averageRating: { $arrayElemAt: ['$recentEngagement.averageRating', 0] },
                  uniqueUsers: { $size: { $arrayElemAt: ['$recentEngagement.uniqueUsers', 0] } }
                },
                {
                  recentViews: 0,
                  averageRating: null,
                  uniqueUsers: 0
                }
              ]
            },
            
            // Search result metadata
            searchResultMetadata: {
              rank: 0,  // Will be set in sort stage
              resultType: 'standard',
              searchAlgorithm: 'mongodb_text_search_v1'
            }
          }
        },

        // Stage 8: Final projection and cleanup
        {
          $project: {
            // Core document information
            title: 1,
            author: 1,
            category: 1,
            tags: 1,
            createdAt: 1,
            updatedAt: 1,
            language: 1,
            
            // Content preview
            contentPreview: {
              $cond: [
                searchConfig.includeHighlights,
                '$searchHighlights.contentSnippet',
                { $substrCP: ['$content', 0, 200] }
              ]
            },
            
            // Search relevance metrics
            textScore: { $round: ['$textScore', 4] },
            relevanceScore: { $round: ['$relevanceScore', 4] },
            matchType: 1,
            contentQuality: 1,
            
            // Content metrics
            wordCount: 1,
            
            // Engagement and quality indicators
            engagementMetrics: 1,
            
            // Related content
            relatedContent: 1,
            
            // Search highlights
            ...(searchConfig.includeHighlights && { searchHighlights: 1 }),
            
            // Metadata
            searchMetadata: 1,
            searchResultMetadata: 1
          }
        },

        // Stage 9: Sorting based on configuration
        {
          $sort: {
            ...(searchConfig.sortBy === 'relevance' && { relevanceScore: -1, textScore: -1 }),
            ...(searchConfig.sortBy === 'date' && { createdAt: -1 }),
            ...(searchConfig.sortBy === 'popularity' && { 'analytics.viewCount': -1 }),
            ...(searchConfig.sortBy === 'rating' && { 'analytics.averageRating': -1 })
          }
        },

        // Stage 10: Add search ranking
        {
          $addFields: {
            'searchResultMetadata.rank': {
              $add: [{ $indexOfArray: [{ $map: { input: { $range: [0, searchConfig.limit] }, as: 'i', in: '$$i' } }, { $indexOfArray: [{ $map: { input: { $range: [0, searchConfig.limit] }, as: 'i', in: '$$i' } }, 0] }] }, 1]
            }
          }
        },

        // Stage 11: Limit results
        {
          $limit: searchConfig.limit
        }
      ];

      // Execute search pipeline
      const searchResults = await this.collections.documents
        .aggregate(searchPipeline, {
          allowDiskUse: true,
          maxTimeMS: 30000
        })
        .toArray();

      const searchLatency = Date.now() - searchStartTime;

      // Generate search facets if requested
      let facets = null;
      if (searchConfig.enableFacets) {
        facets = await this.generateSearchFacets(searchQuery, searchConfig);
      }

      // Log search analytics
      await this.logSearchAnalytics({
        query: searchConfig.query,
        resultsCount: searchResults.length,
        searchLatency: searchLatency,
        searchConfig: searchConfig,
        timestamp: new Date()
      });

      console.log(`✅ Text search completed: ${searchResults.length} results in ${searchLatency}ms`);

      return {
        success: true,
        query: searchConfig.query,
        results: searchResults,
        facets: facets,
        searchMetadata: {
          latency: searchLatency,
          resultsCount: searchResults.length,
          language: searchConfig.language,
          algorithm: 'mongodb_text_search_v1'
        }
      };

    } catch (error) {
      console.error('Error performing text search:', error);
      const searchLatency = Date.now() - searchStartTime;
      
      return {
        success: false,
        error: error.message,
        searchMetadata: {
          latency: searchLatency,
          resultsCount: 0
        }
      };
    }
  }

  async generateSearchFacets(searchQuery, searchConfig) {
    console.log('Generating search facets...');
    
    try {
      const facetPipeline = [
        // Match documents that would appear in search results
        {
          $match: {
            $text: {
              $search: searchQuery,
              $language: searchConfig.language
            },
            isPublished: true,
            isActive: { $ne: false }
          }
        },
        
        // Generate facet aggregations
        {
          $facet: {
            // Category distribution
            categories: [
              {
                $group: {
                  _id: '$category',
                  count: { $sum: 1 },
                  averageRelevance: { $avg: { $meta: 'textScore' } }
                }
              },
              {
                $sort: { count: -1 }
              },
              {
                $limit: 10
              }
            ],
            
            // Author distribution
            authors: [
              {
                $group: {
                  _id: '$author',
                  count: { $sum: 1 },
                  latestDocument: { $max: '$createdAt' }
                }
              },
              {
                $sort: { count: -1 }
              },
              {
                $limit: 10
              }
            ],
            
            // Tag distribution
            tags: [
              {
                $unwind: '$tags'
              },
              {
                $group: {
                  _id: '$tags',
                  count: { $sum: 1 }
                }
              },
              {
                $sort: { count: -1 }
              },
              {
                $limit: 15
              }
            ],
            
            // Date range distribution
            dateRanges: [
              {
                $group: {
                  _id: {
                    $switch: {
                      branches: [
                        {
                          case: { $gte: ['$createdAt', { $subtract: [new Date(), 7 * 24 * 60 * 60 * 1000] }] },
                          then: 'last_week'
                        },
                        {
                          case: { $gte: ['$createdAt', { $subtract: [new Date(), 30 * 24 * 60 * 60 * 1000] }] },
                          then: 'last_month'
                        },
                        {
                          case: { $gte: ['$createdAt', { $subtract: [new Date(), 90 * 24 * 60 * 60 * 1000] }] },
                          then: 'last_quarter'
                        },
                        {
                          case: { $gte: ['$createdAt', { $subtract: [new Date(), 365 * 24 * 60 * 60 * 1000] }] },
                          then: 'last_year'
                        }
                      ],
                      default: 'older'
                    }
                  },
                  count: { $sum: 1 }
                }
              }
            ],
            
            // Content quality distribution
            contentQuality: [
              {
                $group: {
                  _id: {
                    $switch: {
                      branches: [
                        {
                          case: { $gte: ['$wordCount', 1000] },
                          then: 'comprehensive'
                        },
                        {
                          case: { $gte: ['$wordCount', 500] },
                          then: 'detailed'
                        },
                        {
                          case: { $gte: ['$wordCount', 200] },
                          then: 'standard'
                        }
                      ],
                      default: 'brief'
                    }
                  },
                  count: { $sum: 1 }
                }
              }
            ]
          }
        }
      ];

      const facetResults = await this.collections.documents
        .aggregate(facetPipeline)
        .toArray();

      return facetResults[0];

    } catch (error) {
      console.error('Error generating search facets:', error);
      return null;
    }
  }

  async generateAutoCompleteData(query, limit = 10) {
    console.log(`Generating auto-complete suggestions for: "${query}"`);
    
    try {
      // Use text search with partial matching for auto-complete
      const autoCompletePipeline = [
        {
          $match: {
            $or: [
              { title: { $regex: query, $options: 'i' } },
              { tags: { $regex: query, $options: 'i' } },
              { category: { $regex: query, $options: 'i' } }
            ],
            isPublished: true
          }
        },
        {
          $group: {
            _id: null,
            titleSuggestions: {
              $addToSet: {
                $cond: [
                  { $regexMatch: { input: '$title', regex: query, options: 'i' } },
                  '$title',
                  null
                ]
              }
            },
            tagSuggestions: { $addToSet: '$tags' },
            categorySuggestions: { $addToSet: '$category' }
          }
        },
        {
          $project: {
            suggestions: {
              $setUnion: [
                { $filter: { input: '$titleSuggestions', cond: { $ne: ['$$this', null] } } },
                { $reduce: {
                  input: '$tagSuggestions',
                  initialValue: [],
                  in: { $concatArrays: ['$$value', '$$this'] }
                }},
                '$categorySuggestions'
              ]
            }
          }
        },
        {
          $unwind: '$suggestions'
        },
        {
          $match: {
            suggestions: { $regex: query, $options: 'i' }
          }
        },
        {
          $group: {
            _id: '$suggestions',
            relevance: { $sum: 1 }
          }
        },
        {
          $sort: { relevance: -1 }
        },
        {
          $limit: limit
        }
      ];

      const autoCompleteResults = await this.collections.documents
        .aggregate(autoCompletePipeline)
        .toArray();

      return {
        suggestions: autoCompleteResults.map(result => ({
          text: result._id,
          relevance: result.relevance
        }))
      };

    } catch (error) {
      console.error('Error generating auto-complete suggestions:', error);
      return { suggestions: [] };
    }
  }

  async setupSearchAnalytics() {
    console.log('Setting up search analytics infrastructure...');
    
    try {
      // Create indexes for search analytics
      await this.collections.searchAnalytics.createIndexes([
        {
          key: { timestamp: -1 },
          name: 'timestamp_index',
          background: true
        },
        {
          key: { 'query': 1, timestamp: -1 },
          name: 'query_time_index',
          background: true
        },
        {
          key: { resultsCount: 1, searchLatency: 1 },
          name: 'performance_index',
          background: true
        }
      ]);

      console.log('✅ Search analytics infrastructure setup completed');

    } catch (error) {
      console.error('Error setting up search analytics:', error);
      throw error;
    }
  }

  async setupSearchSuggestions() {
    console.log('Setting up search suggestions system...');
    
    try {
      // Create collection for search suggestions with text index
      await this.collections.searchSuggestions.createIndex(
        { suggestion: 'text' },
        {
          name: 'suggestion_text_index',
          background: true
        }
      );

      console.log('✅ Search suggestions system setup completed');

    } catch (error) {
      console.error('Error setting up search suggestions:', error);
    }
  }

  async logSearchAnalytics(searchData) {
    try {
      await this.collections.searchAnalytics.insertOne({
        ...searchData,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error logging search analytics:', error);
    }
  }

  async getSearchPerformanceReport(timeRange = '24h') {
    console.log('Generating search performance report...');
    
    try {
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      const performanceReport = await this.collections.searchAnalytics.aggregate([
        {
          $match: {
            timestamp: { $gte: startTime }
          }
        },
        {
          $group: {
            _id: null,
            totalSearches: { $sum: 1 },
            averageLatency: { $avg: '$searchLatency' },
            medianLatency: { $percentile: { input: '$searchLatency', p: [0.5] } },
            p95Latency: { $percentile: { input: '$searchLatency', p: [0.95] } },
            averageResultsCount: { $avg: '$resultsCount' },
            uniqueQueries: { $addToSet: '$query' },
            zeroResultQueries: {
              $sum: {
                $cond: [{ $eq: ['$resultsCount', 0] }, 1, 0]
              }
            }
          }
        },
        {
          $project: {
            totalSearches: 1,
            averageLatency: { $round: ['$averageLatency', 2] },
            medianLatency: { $round: [{ $arrayElemAt: ['$medianLatency', 0] }, 2] },
            p95Latency: { $round: [{ $arrayElemAt: ['$p95Latency', 0] }, 2] },
            averageResultsCount: { $round: ['$averageResultsCount', 1] },
            uniqueQueryCount: { $size: '$uniqueQueries' },
            zeroResultRate: {
              $round: [
                { $multiply: [{ $divide: ['$zeroResultQueries', '$totalSearches'] }, 100] },
                2
              ]
            }
          }
        }
      ]).toArray();

      return performanceReport[0] || {};

    } catch (error) {
      console.error('Error generating search performance report:', error);
      return {};
    }
  }

  parseTimeRange(timeRange) {
    const timeMap = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return timeMap[timeRange] || timeMap['24h'];
  }

  async shutdown() {
    console.log('Shutting down Full-Text Search manager...');
    
    try {
      if (this.client) {
        await this.client.close();
      }
      console.log('Full-Text Search manager shutdown completed');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

// Benefits of MongoDB Full-Text Search:
// - Native text indexing with advanced linguistic processing and language support
// - Intelligent relevance scoring with customizable ranking algorithms
// - High-performance text queries with automatic optimization and caching
// - Advanced search features including fuzzy matching, auto-complete, and faceted search
// - Seamless integration with existing MongoDB data and operations
// - Real-time search analytics and query performance monitoring
// - Flexible scoring mechanisms incorporating business logic and user behavior
// - Multi-language support with language-specific stemming and stop word processing
// - SQL-compatible text search operations through QueryLeaf integration
// - Enterprise-ready scalability with distributed search capabilities

module.exports = {
  MongoFullTextSearchManager
};
```

## Understanding MongoDB Full-Text Search Architecture

### Advanced Search Patterns for Content Management

MongoDB Full-Text Search enables sophisticated content discovery patterns for modern applications:

```javascript
// Enterprise Content Discovery Platform with Advanced Search Capabilities
class EnterpriseContentSearchPlatform extends MongoFullTextSearchManager {
  constructor(db, enterpriseConfig) {
    super(db, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      enableSemanticSearch: true,
      enablePersonalization: true,
      enableSearchInsights: true,
      enableContentRecommendations: true
    };
    
    this.setupEnterpriseSearchCapabilities();
  }

  async implementAdvancedSearchPatterns() {
    console.log('Implementing enterprise search patterns...');
    
    const searchPatterns = {
      // Semantic search enhancement
      semanticSearchEnhancement: {
        enableConceptualMatching: true,
        enableEntityRecognition: true,
        enableTopicModeling: true,
        enableContextualSearch: true
      },
      
      // Personalized search results
      personalizedSearch: {
        userProfileIntegration: true,
        behaviorBasedRanking: true,
        preferenceBasedFiltering: true,
        collaborativeFiltering: true
      },
      
      // Content recommendation engine
      contentRecommendations: {
        similarContentDiscovery: true,
        trendingContentIdentification: true,
        relatedTopicSuggestions: true,
        expertiseBasedRecommendations: true
      },
      
      // Search quality optimization
      searchQualityOptimization: {
        queryUnderstandingEnhancement: true,
        resultDiversification: true,
        relevanceFeedbackIntegration: true,
        searchResultOptimization: true
      }
    };

    return await this.deployEnterpriseSearchPatterns(searchPatterns);
  }

  async implementPersonalizedSearch(userId, searchQuery, searchOptions = {}) {
    console.log(`Implementing personalized search for user: ${userId}`);
    
    // Get user search profile and preferences
    const userProfile = await this.getUserSearchProfile(userId);
    
    // Enhance search with personalization
    const personalizedSearchOptions = {
      ...searchOptions,
      userProfile: userProfile,
      personalizedScoring: true,
      contentPreferences: userProfile.contentPreferences,
      expertiseLevel: userProfile.expertiseLevel,
      preferredAuthors: userProfile.preferredAuthors,
      preferredCategories: userProfile.preferredCategories
    };

    // Execute personalized search
    const personalizedResults = await this.performIntelligentTextSearch(
      searchQuery, 
      personalizedSearchOptions
    );

    // Update user search behavior
    await this.updateUserSearchBehavior(userId, searchQuery, personalizedResults);

    return personalizedResults;
  }

  async getUserSearchProfile(userId) {
    // Aggregate user search behavior and preferences
    const userProfilePipeline = [
      {
        $match: {
          userId: userId,
          timestamp: {
            $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
          }
        }
      },
      {
        $group: {
          _id: '$userId',
          searchQueries: { $push: '$query' },
          clickedResults: { $push: '$clickedDocuments' },
          preferredCategories: { $push: '$categoryInteractions' },
          searchPatterns: { $push: '$searchMetadata' }
        }
      }
    ];

    const profileData = await this.collections.searchAnalytics
      .aggregate(userProfilePipeline)
      .toArray();

    return this.buildUserSearchProfile(profileData[0] || {});
  }

  buildUserSearchProfile(rawProfileData) {
    return {
      contentPreferences: this.extractContentPreferences(rawProfileData),
      expertiseLevel: this.assessExpertiseLevel(rawProfileData),
      preferredAuthors: this.identifyPreferredAuthors(rawProfileData),
      preferredCategories: this.identifyPreferredCategories(rawProfileData),
      searchBehaviorPatterns: this.analyzeSearchPatterns(rawProfileData)
    };
  }
}
```

## SQL-Style Full-Text Search Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Full-Text Search operations:

```sql
-- QueryLeaf full-text search operations with SQL-familiar syntax

-- Create full-text searchable table
CREATE TABLE content_documents (
    document_id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    author VARCHAR(200),
    category VARCHAR(100),
    tags TEXT[],
    language VARCHAR(10) DEFAULT 'en',
    
    -- Content metadata
    word_count INTEGER,
    reading_time_minutes INTEGER,
    content_type VARCHAR(50),
    
    -- Publishing information
    published_date DATE,
    is_published BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    
    -- Analytics
    view_count BIGINT DEFAULT 0,
    like_count BIGINT DEFAULT 0,
    share_count BIGINT DEFAULT 0,
    average_rating DECIMAL(3,2),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    
) WITH (
    -- MongoDB full-text search configuration
    text_indexes = [
        {
            name: 'comprehensive_text_search',
            fields: {
                title: 10,      -- Higher weight for title matches
                content: 5,     -- Standard weight for content
                description: 8, -- High weight for descriptions
                tags: 7,        -- High weight for tag matches
                category: 3,    -- Lower weight for category
                author: 2       -- Lowest weight for author name
            },
            language: 'en',
            language_override: 'language'
        },
        {
            name: 'category_focused_search',
            fields: {
                title: 'text',
                content: 'text'
            },
            filters: ['category']
        }
    ]
);

-- Advanced full-text search with relevance scoring
WITH intelligent_search_results AS (
    SELECT 
        document_id,
        title,
        content,
        description,
        author,
        category,
        tags,
        published_date,
        word_count,
        view_count,
        average_rating,
        
        -- MongoDB text search score
        TEXT_SEARCH_SCORE() as text_relevance_score,
        
        -- Enhanced relevance calculation
        (
            -- Base text relevance (40%)
            TEXT_SEARCH_SCORE() * 0.4 +
            
            -- Title match bonus (30%)
            CASE 
                WHEN LOWER(title) LIKE '%' || LOWER($1) || '%' THEN 0.3
                WHEN title ILIKE '%' || $1 || '%' THEN 0.2  -- Case insensitive partial match
                ELSE 0.0
            END +
            
            -- Recency factor (10%)
            CASE 
                WHEN published_date >= CURRENT_DATE - INTERVAL '30 days' THEN 0.1
                WHEN published_date >= CURRENT_DATE - INTERVAL '90 days' THEN 0.05
                ELSE 0.0
            END +
            
            -- Popularity boost (10%)
            LEAST(0.1, (view_count / 10000.0)) +
            
            -- Quality indicator (10%)
            CASE 
                WHEN average_rating >= 4.5 THEN 0.1
                WHEN average_rating >= 4.0 THEN 0.05
                WHEN average_rating >= 3.5 THEN 0.025
                ELSE 0.0
            END
        ) as enhanced_relevance_score,
        
        -- Content quality assessment
        CASE 
            WHEN word_count >= 1500 AND average_rating >= 4.0 THEN 'comprehensive_high_quality'
            WHEN word_count >= 800 AND average_rating >= 3.5 THEN 'detailed_good_quality'
            WHEN word_count >= 300 AND average_rating >= 3.0 THEN 'standard_quality'
            WHEN word_count >= 100 THEN 'brief_content'
            ELSE 'minimal_content'
        END as content_quality_tier,
        
        -- Match type classification
        CASE 
            WHEN LOWER(title) LIKE '%' || LOWER($1) || '%' THEN 'title_match'
            WHEN TEXT_SEARCH_SCORE() > 2.0 THEN 'strong_content_match'
            WHEN TEXT_SEARCH_SCORE() > 1.0 THEN 'good_content_match'
            ELSE 'weak_content_match'
        END as match_type
        
    FROM content_documents
    WHERE 
        -- Full-text search condition
        TEXT_SEARCH(title, content, description, tags, $1) -- $1 = search query
        
        -- Quality and availability filters
        AND is_published = true
        AND word_count >= 50  -- Minimum content length
        
        -- Optional category filter
        AND ($2 IS NULL OR category = $2)  -- $2 = optional category filter
        
        -- Optional date range filter  
        AND ($3 IS NULL OR published_date >= $3::DATE)  -- $3 = optional start date
        AND ($4 IS NULL OR published_date <= $4::DATE)  -- $4 = optional end date
),

search_with_highlights AS (
    SELECT 
        isr.*,
        
        -- Generate search highlights
        TEXT_HIGHLIGHT(title, $1, 'MaxWords=10') as title_highlight,
        TEXT_HIGHLIGHT(content, $1, 'MaxWords=30, MinWords=10') as content_highlight,
        TEXT_HIGHLIGHT(description, $1, 'MaxWords=20') as description_highlight,
        
        -- Content preview generation
        CASE 
            WHEN LENGTH(content) <= 200 THEN content
            WHEN POSITION(LOWER($1) IN LOWER(content)) > 0 THEN
                -- Extract snippet around search term
                SUBSTRING(
                    content, 
                    GREATEST(1, POSITION(LOWER($1) IN LOWER(content)) - 50), 
                    200
                ) || '...'
            ELSE 
                LEFT(content, 200) || '...'
        END as content_preview,
        
        -- Tag matching analysis
        ARRAY(
            SELECT tag 
            FROM UNNEST(tags) AS tag 
            WHERE tag ILIKE '%' || $1 || '%'
        ) as matching_tags,
        
        -- Related content scoring
        ARRAY_LENGTH(
            ARRAY(
                SELECT tag 
                FROM UNNEST(tags) AS tag 
                WHERE tag ILIKE '%' || $1 || '%'
            ),
            1
        ) as tag_match_count
        
    FROM intelligent_search_results isr
),

search_analytics AS (
    SELECT 
        swh.*,
        
        -- Search result ranking
        ROW_NUMBER() OVER (ORDER BY enhanced_relevance_score DESC, text_relevance_score DESC) as search_rank,
        
        -- Category diversity ranking
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY enhanced_relevance_score DESC) as category_rank,
        
        -- Author diversity ranking  
        ROW_NUMBER() OVER (PARTITION BY author ORDER BY enhanced_relevance_score DESC) as author_rank,
        
        -- Quality tier ranking
        ROW_NUMBER() OVER (PARTITION BY content_quality_tier ORDER BY enhanced_relevance_score DESC) as quality_tier_rank,
        
        -- Engagement metrics
        (view_count + like_count * 2 + share_count * 3) as engagement_score,
        
        -- Search confidence scoring
        CASE 
            WHEN enhanced_relevance_score >= 1.5 THEN 'high_confidence'
            WHEN enhanced_relevance_score >= 0.8 THEN 'medium_confidence'
            WHEN enhanced_relevance_score >= 0.4 THEN 'low_confidence'
            ELSE 'very_low_confidence'
        END as search_confidence
        
    FROM search_with_highlights swh
)

SELECT 
    document_id,
    title,
    content_preview,
    description,
    author,
    category,
    tags,
    TO_CHAR(published_date, 'YYYY-MM-DD') as published_date,
    
    -- Search relevance metrics
    ROUND(text_relevance_score::NUMERIC, 4) as text_score,
    ROUND(enhanced_relevance_score::NUMERIC, 4) as relevance_score,
    search_rank,
    match_type,
    search_confidence,
    
    -- Content characteristics
    word_count,
    content_quality_tier,
    ROUND((word_count / NULLIF(reading_time_minutes, 0))::NUMERIC, 0) as reading_speed_wpm,
    
    -- Search highlights
    title_highlight,
    content_highlight,
    description_highlight,
    
    -- Tag analysis
    matching_tags,
    tag_match_count,
    
    -- Engagement and quality
    view_count,
    like_count,
    share_count,
    average_rating,
    engagement_score,
    
    -- Diversity indicators
    category_rank,
    author_rank,
    quality_tier_rank,
    
    -- Search metadata
    CASE 
        WHEN search_confidence = 'high_confidence' THEN 'Excellent match for your search'
        WHEN match_type = 'title_match' THEN 'Title contains your search terms'
        WHEN content_quality_tier = 'comprehensive_high_quality' THEN 'Comprehensive, high-quality content'
        WHEN engagement_score > 100 THEN 'Popular content with high engagement'
        ELSE 'Relevant match found'
    END as result_description,
    
    CURRENT_TIMESTAMP as search_performed_at

FROM search_analytics
WHERE 
    -- Result quality thresholds
    enhanced_relevance_score >= 0.2
    AND text_relevance_score >= 0.5
    
    -- Diversity constraints for better result variety
    AND category_rank <= 3          -- Max 3 results per category
    AND author_rank <= 2            -- Max 2 results per author  
    AND quality_tier_rank <= 5      -- Max 5 per quality tier

ORDER BY 
    enhanced_relevance_score DESC,
    search_rank ASC,
    engagement_score DESC
LIMIT 20;

-- Search faceting for advanced filtering
WITH search_facets AS (
    SELECT 
        category,
        author,
        content_quality_tier,
        EXTRACT(YEAR FROM published_date) as publication_year,
        COUNT(*) as result_count,
        AVG(enhanced_relevance_score) as avg_relevance,
        MAX(enhanced_relevance_score) as max_relevance
        
    FROM intelligent_search_results
    GROUP BY category, author, content_quality_tier, EXTRACT(YEAR FROM published_date)
    HAVING COUNT(*) >= 2  -- Minimum results threshold
)

SELECT 
    'category' as facet_type,
    category as facet_value,
    result_count,
    ROUND(avg_relevance::NUMERIC, 3) as avg_relevance_score,
    ROUND(max_relevance::NUMERIC, 3) as max_relevance_score
FROM search_facets
WHERE category IS NOT NULL

UNION ALL

SELECT 
    'author' as facet_type,
    author as facet_value,
    result_count,
    ROUND(avg_relevance::NUMERIC, 3) as avg_relevance_score,
    ROUND(max_relevance::NUMERIC, 3) as max_relevance_score
FROM search_facets  
WHERE author IS NOT NULL AND result_count >= 3

UNION ALL

SELECT 
    'content_quality' as facet_type,
    content_quality_tier as facet_value,
    result_count,
    ROUND(avg_relevance::NUMERIC, 3) as avg_relevance_score,
    ROUND(max_relevance::NUMERIC, 3) as max_relevance_score
FROM search_facets
WHERE content_quality_tier IS NOT NULL

UNION ALL

SELECT 
    'publication_year' as facet_type,
    publication_year::TEXT as facet_value,
    result_count,
    ROUND(avg_relevance::NUMERIC, 3) as avg_relevance_score,
    ROUND(max_relevance::NUMERIC, 3) as max_relevance_score
FROM search_facets
WHERE publication_year IS NOT NULL

ORDER BY facet_type, result_count DESC;

-- Search analytics and insights
CREATE VIEW search_performance_insights AS
WITH search_statistics AS (
    SELECT 
        DATE_TRUNC('day', search_performed_at) as search_date,
        search_query,
        COUNT(*) as search_frequency,
        AVG(results_count) as avg_results_returned,
        AVG(search_latency) as avg_search_latency,
        
        -- Query analysis
        LENGTH(search_query) as query_length,
        ARRAY_LENGTH(STRING_TO_ARRAY(search_query, ' '), 1) as query_word_count,
        
        -- Zero result tracking
        COUNT(*) FILTER (WHERE results_count = 0) as zero_result_searches,
        COUNT(*) FILTER (WHERE results_count > 0) as successful_searches,
        
        -- Performance classification
        COUNT(*) FILTER (WHERE search_latency <= 100) as fast_searches,
        COUNT(*) FILTER (WHERE search_latency <= 500) as acceptable_searches,
        COUNT(*) FILTER (WHERE search_latency > 500) as slow_searches
        
    FROM search_analytics_log
    WHERE search_performed_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', search_performed_at), search_query
    HAVING COUNT(*) >= 2  -- Focus on repeated queries
),

search_trends AS (
    SELECT 
        search_query,
        SUM(search_frequency) as total_searches,
        AVG(avg_results_returned) as overall_avg_results,
        AVG(avg_search_latency) as overall_avg_latency,
        
        -- Success rate calculation
        (SUM(successful_searches)::DECIMAL / NULLIF(SUM(search_frequency), 0)) * 100 as success_rate_percent,
        
        -- Performance score
        (SUM(fast_searches)::DECIMAL / NULLIF(SUM(search_frequency), 0)) * 100 as fast_search_percent,
        
        -- Query characteristics
        AVG(query_length) as avg_query_length,
        AVG(query_word_count) as avg_query_words,
        
        -- Trend analysis
        COUNT(DISTINCT search_date) as search_days,
        MIN(search_date) as first_search_date,
        MAX(search_date) as last_search_date
        
    FROM search_statistics
    GROUP BY search_query
),

query_insights AS (
    SELECT 
        st.*,
        
        -- Classification
        CASE 
            WHEN success_rate_percent >= 95 THEN 'high_performing_query'
            WHEN success_rate_percent >= 80 THEN 'good_performing_query'
            WHEN success_rate_percent >= 60 THEN 'fair_performing_query'
            ELSE 'poor_performing_query'
        END as query_performance_class,
        
        CASE 
            WHEN total_searches >= 100 THEN 'very_popular'
            WHEN total_searches >= 50 THEN 'popular'  
            WHEN total_searches >= 20 THEN 'moderately_popular'
            WHEN total_searches >= 10 THEN 'occasionally_used'
            ELSE 'rarely_used'
        END as query_popularity_class,
        
        CASE 
            WHEN fast_search_percent >= 90 THEN 'excellent_performance'
            WHEN fast_search_percent >= 70 THEN 'good_performance'
            WHEN fast_search_percent >= 50 THEN 'acceptable_performance'
            ELSE 'poor_performance'
        END as latency_performance_class,
        
        -- Recommendations
        CASE 
            WHEN success_rate_percent < 60 THEN 'Improve content coverage for this query'
            WHEN fast_search_percent < 50 THEN 'Optimize search performance'
            WHEN overall_avg_results < 5 THEN 'Expand content in this area'
            ELSE 'Query performing well'
        END as optimization_recommendation
        
    FROM search_trends st
)

SELECT 
    search_query,
    query_popularity_class,
    query_performance_class,  
    latency_performance_class,
    
    -- Key metrics
    total_searches,
    ROUND(success_rate_percent::NUMERIC, 1) as success_rate_pct,
    ROUND(overall_avg_results::NUMERIC, 1) as avg_results_returned,
    ROUND(overall_avg_latency::NUMERIC, 0) as avg_latency_ms,
    ROUND(fast_search_percent::NUMERIC, 1) as fast_searches_pct,
    
    -- Query characteristics
    ROUND(avg_query_length::NUMERIC, 1) as avg_character_length,
    ROUND(avg_query_words::NUMERIC, 1) as avg_word_count,
    
    -- Usage patterns
    search_days as days_active,
    TO_CHAR(first_search_date, 'YYYY-MM-DD') as first_seen,
    TO_CHAR(last_search_date, 'YYYY-MM-DD') as last_seen,
    
    -- Insights and recommendations
    optimization_recommendation,
    
    -- Priority scoring for optimization efforts
    CASE 
        WHEN query_popularity_class IN ('very_popular', 'popular') AND query_performance_class IN ('poor_performing_query', 'fair_performing_query') THEN 1
        WHEN query_popularity_class = 'very_popular' AND latency_performance_class = 'poor_performance' THEN 2
        WHEN query_performance_class = 'poor_performing_query' THEN 3
        ELSE 4
    END as optimization_priority

FROM query_insights
ORDER BY 
    optimization_priority ASC,
    total_searches DESC,
    success_rate_percent ASC;

-- QueryLeaf provides comprehensive full-text search capabilities:
-- 1. SQL-familiar TEXT_SEARCH function for complex text queries
-- 2. Advanced relevance scoring with customizable ranking algorithms  
-- 3. Built-in search highlighting and snippet generation
-- 4. Faceted search capabilities with aggregation-based filtering
-- 5. Search analytics and performance monitoring with SQL queries
-- 6. Auto-complete and suggestion generation using pattern matching
-- 7. Multi-language text search support with language-specific processing
-- 8. Enterprise search patterns with personalization and recommendations
-- 9. Native integration with MongoDB text indexing optimizations
-- 10. Familiar SQL patterns for complex search and content discovery requirements
```

## Best Practices for Full-Text Search Implementation

### Index Design and Optimization

Essential practices for production full-text search deployments:

1. **Weight Configuration**: Assign appropriate weights to different fields based on their importance for relevance scoring
2. **Language Support**: Configure language-specific processing for stemming, stop words, and linguistic analysis
3. **Index Maintenance**: Monitor index performance and rebuild indexes when content patterns change significantly
4. **Query Optimization**: Design search queries that leverage index capabilities while minimizing performance overhead
5. **Result Caching**: Implement intelligent caching strategies for frequently executed search queries
6. **Performance Monitoring**: Track search latency, relevance quality, and user satisfaction metrics

### Enterprise Search Architecture

Design full-text search systems for enterprise-scale content discovery:

1. **Personalization Integration**: Implement user behavior tracking and personalized ranking algorithms
2. **Content Quality Assessment**: Develop metrics for content quality that influence search ranking
3. **Search Analytics**: Establish comprehensive search analytics for query optimization and content gap analysis
4. **Faceted Navigation**: Design intuitive faceted search interfaces that help users refine search results
5. **Auto-Complete Systems**: Implement intelligent auto-complete that learns from user behavior and content
6. **Multi-Modal Search**: Integrate text search with other search capabilities like vector similarity and geospatial queries

## Conclusion

MongoDB Full-Text Search provides comprehensive intelligent content discovery capabilities that eliminate the complexity and limitations of traditional database text search approaches. The combination of advanced linguistic processing, intelligent relevance scoring, and sophisticated analytical capabilities enables modern applications to deliver the intelligent search experiences users expect while maintaining familiar database interaction patterns.

Key Full-Text Search benefits include:

- **Advanced Linguistic Processing**: Native support for stemming, stop word filtering, and multi-language text analysis
- **Intelligent Relevance Scoring**: Sophisticated ranking algorithms with customizable business logic integration
- **High-Performance Text Queries**: Optimized text indexing with automatic query optimization and caching
- **Enterprise Search Features**: Built-in support for faceted search, auto-complete, and search analytics
- **Seamless MongoDB Integration**: Unified data access patterns with existing MongoDB operations and security
- **SQL Compatibility**: Familiar search operations through QueryLeaf for accessible content discovery development

Whether you're building knowledge management systems, content discovery platforms, e-commerce search functionality, or any application requiring intelligent text search, MongoDB Full-Text Search with QueryLeaf's SQL-familiar interface provides the foundation for modern content discovery that scales efficiently while maintaining familiar interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Full-Text Search operations while providing SQL-familiar syntax for text search queries, relevance scoring, and search analytics. Advanced content discovery patterns including personalized search, faceted navigation, and search optimization are seamlessly accessible through familiar SQL constructs, making sophisticated search development both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's robust text search capabilities with SQL-style operations makes it an ideal platform for applications requiring both intelligent content discovery and familiar database query patterns, ensuring your search solutions remain both effective and maintainable as content volumes and user expectations evolve.