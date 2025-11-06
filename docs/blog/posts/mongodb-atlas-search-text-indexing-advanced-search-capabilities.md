---
title: "MongoDB Atlas Search and Advanced Text Indexing: Full-Text Search with Vector Similarity and Multi-Language Support"
description: "Master MongoDB Atlas Search with advanced text indexing, vector similarity search, and comprehensive multi-language search capabilities. Learn sophisticated search patterns, relevance scoring, and production-ready search implementations with SQL-familiar syntax."
date: 2025-11-05
tags: [mongodb, atlas-search, full-text, search, indexing, vector-search, nlp, sql]
---

# MongoDB Atlas Search and Advanced Text Indexing: Full-Text Search with Vector Similarity and Multi-Language Support

Modern applications require sophisticated search capabilities that go beyond simple text matching to provide relevant, contextual results across multiple data types and languages. Traditional full-text search implementations struggle with semantic understanding, multi-language support, and the complexity of integrating machine learning-based relevance scoring, often requiring separate search engines and complex data synchronization processes that increase operational overhead and system complexity.

MongoDB Atlas Search provides comprehensive native search capabilities with advanced text indexing, vector similarity search, and intelligent relevance scoring that eliminate the need for external search engines. Unlike traditional approaches that require separate search infrastructure and complex data pipelines, Atlas Search integrates seamlessly with MongoDB collections, providing real-time search synchronization, multi-language support, and machine learning-enhanced search experiences within a unified platform.

## The Traditional Search Challenge

Conventional search implementations involve significant complexity and operational burden:

```sql
-- Traditional PostgreSQL full-text search approach - limited and complex
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Basic document storage with limited search capabilities
CREATE TABLE documents (
    document_id BIGSERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    author VARCHAR(200),
    category VARCHAR(100),
    tags VARCHAR(255)[],
    
    -- Language and localization
    language VARCHAR(10) DEFAULT 'en',
    content_locale VARCHAR(10),
    
    -- Metadata for search
    publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'published',
    
    -- Basic search vectors (very limited functionality)
    title_vector TSVECTOR,
    content_vector TSVECTOR,
    combined_vector TSVECTOR
);

-- Manual maintenance of search vectors required
CREATE OR REPLACE FUNCTION update_document_search_vectors()
RETURNS TRIGGER AS $$
BEGIN
    -- Basic text search vector creation (limited language support)
    NEW.title_vector := to_tsvector('english', COALESCE(NEW.title, ''));
    NEW.content_vector := to_tsvector('english', COALESCE(NEW.content, ''));
    NEW.combined_vector := to_tsvector('english', 
        COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_search_vectors
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_document_search_vectors();

-- Basic GIN indexes for text search (limited optimization)
CREATE INDEX idx_documents_title_search ON documents USING GIN(title_vector);
CREATE INDEX idx_documents_content_search ON documents USING GIN(content_vector);
CREATE INDEX idx_documents_combined_search ON documents USING GIN(combined_vector);
CREATE INDEX idx_documents_category_status ON documents(category, status);

-- User search behavior and analytics tracking
CREATE TABLE search_queries (
    query_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    session_id VARCHAR(100),
    query_text TEXT NOT NULL,
    query_language VARCHAR(10) DEFAULT 'en',
    
    -- Search parameters
    filters_applied JSONB,
    sort_criteria VARCHAR(100),
    page_number INTEGER DEFAULT 1,
    results_per_page INTEGER DEFAULT 10,
    
    -- Search results and performance
    total_results_found INTEGER,
    execution_time_ms INTEGER,
    results_clicked INTEGER[] DEFAULT '{}',
    
    -- User context
    user_agent TEXT,
    referrer TEXT,
    search_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Search quality metrics
    user_satisfaction INTEGER CHECK (user_satisfaction BETWEEN 1 AND 5),
    bounce_rate DECIMAL(4,2),
    conversion_achieved BOOLEAN DEFAULT FALSE
);

-- Complex search query with limited capabilities
WITH search_base AS (
    SELECT 
        d.document_id,
        d.title,
        d.content,
        d.author,
        d.category,
        d.tags,
        d.publish_date,
        d.language,
        
        -- Basic relevance scoring (very primitive)
        ts_rank_cd(d.title_vector, plainto_tsquery('english', $search_query)) * 2.0 as title_relevance,
        ts_rank_cd(d.content_vector, plainto_tsquery('english', $search_query)) as content_relevance,
        
        -- Combine relevance scores
        (ts_rank_cd(d.title_vector, plainto_tsquery('english', $search_query)) * 2.0 +
         ts_rank_cd(d.content_vector, plainto_tsquery('english', $search_query))) as combined_relevance,
        
        -- Simple popularity boost (no ML)
        LOG(GREATEST(1, (SELECT COUNT(*) FROM search_queries sq WHERE sq.results_clicked @> ARRAY[d.document_id]))) as popularity_score,
        
        -- Basic category boosting
        CASE 
            WHEN d.category = $preferred_category THEN 1.2
            ELSE 1.0
        END as category_boost,
        
        -- Recency boost (basic time decay)
        CASE 
            WHEN d.publish_date >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1.3
            WHEN d.publish_date >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 1.1
            ELSE 1.0
        END as recency_boost
        
    FROM documents d
    WHERE 
        d.status = 'published'
        AND ($language IS NULL OR d.language = $language)
        AND ($category_filter IS NULL OR d.category = $category_filter)
        
        -- Basic text search (limited semantic understanding)
        AND (
            d.combined_vector @@ plainto_tsquery('english', $search_query)
            OR SIMILARITY(d.title, $search_query) > 0.3
            OR d.title ILIKE '%' || $search_query || '%'
            OR d.content ILIKE '%' || $search_query || '%'
        )
),

search_with_scoring AS (
    SELECT 
        sb.*,
        
        -- Final relevance calculation (very basic)
        GREATEST(0.1, 
            sb.combined_relevance * sb.category_boost * sb.recency_boost + 
            (sb.popularity_score * 0.1)
        ) as final_relevance_score,
        
        -- Extract matching snippets (primitive)
        ts_headline('english', 
            LEFT(sb.content, 1000), 
            plainto_tsquery('english', $search_query),
            'MaxWords=35, MinWords=15, MaxFragments=3'
        ) as content_snippet,
        
        -- Count matching terms (basic)
        (SELECT COUNT(*) 
         FROM unnest(string_to_array(lower($search_query), ' ')) as query_word
         WHERE lower(sb.title || ' ' || sb.content) LIKE '%' || query_word || '%'
        ) as matching_terms_count,
        
        -- Simple spell correction suggestions (very limited)
        CASE 
            WHEN SIMILARITY(sb.title, $search_query) < 0.1 THEN
                (SELECT string_agg(suggestion, ' ') 
                 FROM (
                     SELECT word as suggestion 
                     FROM unnest(string_to_array($search_query, ' ')) as word
                     ORDER BY SIMILARITY(word, sb.title) DESC 
                     LIMIT 3
                 ) suggestions)
            ELSE NULL
        END as spelling_suggestions
        
    FROM search_base sb
),

search_analytics AS (
    -- Track search performance (basic analytics)
    SELECT 
        CURRENT_TIMESTAMP as search_executed_at,
        $search_query as query_executed,
        COUNT(*) as total_results_found,
        AVG(sws.final_relevance_score) as avg_relevance_score,
        MAX(sws.final_relevance_score) as max_relevance_score,
        
        -- Category distribution
        json_object_agg(sws.category, COUNT(sws.category)) as results_by_category,
        
        -- Language distribution  
        json_object_agg(sws.language, COUNT(sws.language)) as results_by_language
        
    FROM search_with_scoring sws
    WHERE sws.final_relevance_score > 0.1
)

-- Final search results with basic ranking
SELECT 
    sws.document_id,
    sws.title,
    sws.author,
    sws.category,
    sws.tags,
    sws.publish_date,
    sws.language,
    
    -- Relevance and ranking
    ROUND(sws.final_relevance_score, 4) as relevance_score,
    ROW_NUMBER() OVER (ORDER BY sws.final_relevance_score DESC, sws.publish_date DESC) as search_rank,
    
    -- Content preview
    sws.content_snippet,
    LENGTH(sws.content) as content_length,
    sws.matching_terms_count,
    
    -- Search enhancements (very basic)
    sws.spelling_suggestions,
    
    -- Quality indicators
    CASE 
        WHEN sws.final_relevance_score > 0.8 THEN 'high'
        WHEN sws.final_relevance_score > 0.4 THEN 'medium'
        ELSE 'low'
    END as match_quality,
    
    -- Search metadata
    EXTRACT(DAYS FROM CURRENT_TIMESTAMP - sws.publish_date) as days_old

FROM search_with_scoring sws
WHERE sws.final_relevance_score > 0.1
ORDER BY sws.final_relevance_score DESC, sws.publish_date DESC
LIMIT $results_limit OFFSET $results_offset;

-- Insert search analytics
INSERT INTO search_queries (
    user_id, session_id, query_text, query_language, 
    total_results_found, execution_time_ms, search_timestamp
) VALUES (
    $user_id, $session_id, $search_query, $language,
    (SELECT COUNT(*) FROM search_with_scoring WHERE final_relevance_score > 0.1),
    $execution_time_ms, CURRENT_TIMESTAMP
);

-- Traditional search approach problems:
-- 1. Very limited semantic understanding and context awareness
-- 2. Poor multi-language support requiring separate configurations
-- 3. No vector similarity or machine learning capabilities
-- 4. Manual maintenance of search indexes and vectors
-- 5. Primitive relevance scoring without ML-based optimization
-- 6. No real-time search suggestions or autocomplete
-- 7. Limited spell correction and fuzzy matching capabilities
-- 8. Complex integration with external search engines required for advanced features
-- 9. No built-in search analytics or performance optimization
-- 10. Difficulty in handling multimedia and structured data search
```

MongoDB Atlas Search provides comprehensive search capabilities with advanced indexing and ML integration:

```javascript
// MongoDB Atlas Search - Advanced full-text and vector search capabilities
const { MongoClient, ObjectId } = require('mongodb');

// Comprehensive Atlas Search Manager
class AtlasSearchManager {
  constructor(connectionString, searchConfig = {}) {
    this.connectionString = connectionString;
    this.client = null;
    this.db = null;
    
    this.config = {
      // Search configuration
      enableFullTextSearch: searchConfig.enableFullTextSearch !== false,
      enableVectorSearch: searchConfig.enableVectorSearch !== false,
      enableFacetedSearch: searchConfig.enableFacetedSearch !== false,
      enableAutocomplete: searchConfig.enableAutocomplete !== false,
      
      // Advanced features
      enableSemanticSearch: searchConfig.enableSemanticSearch !== false,
      enableMultiLanguageSearch: searchConfig.enableMultiLanguageSearch !== false,
      enableSpellCorrection: searchConfig.enableSpellCorrection !== false,
      enableSearchAnalytics: searchConfig.enableSearchAnalytics !== false,
      
      // Performance optimization
      searchResultLimit: searchConfig.searchResultLimit || 50,
      facetLimit: searchConfig.facetLimit || 20,
      highlightMaxChars: searchConfig.highlightMaxChars || 500,
      cacheSearchResults: searchConfig.cacheSearchResults !== false,
      
      // ML and AI features
      enableRelevanceScoring: searchConfig.enableRelevanceScoring !== false,
      enablePersonalization: searchConfig.enablePersonalization !== false,
      enableSearchSuggestions: searchConfig.enableSearchSuggestions !== false,
      
      ...searchConfig
    };
    
    // Collections
    this.collections = {
      documents: null,
      searchQueries: null,
      searchAnalytics: null,
      userProfiles: null,
      searchSuggestions: null,
      vectorEmbeddings: null
    };
    
    // Search indexes configuration
    this.searchIndexes = new Map();
    this.vectorIndexes = new Map();
    
    // Performance metrics
    this.searchMetrics = {
      totalSearches: 0,
      averageLatency: 0,
      searchesWithResults: 0,
      popularQueries: new Map()
    };
  }

  async initializeAtlasSearch() {
    console.log('Initializing MongoDB Atlas Search capabilities...');
    
    try {
      // Connect to MongoDB Atlas
      this.client = new MongoClient(this.connectionString);
      await this.client.connect();
      this.db = this.client.db();
      
      // Initialize collections
      await this.setupSearchCollections();
      
      // Create Atlas Search indexes
      await this.createAtlasSearchIndexes();
      
      // Setup vector search if enabled
      if (this.config.enableVectorSearch) {
        await this.setupVectorSearch();
      }
      
      // Initialize search analytics
      if (this.config.enableSearchAnalytics) {
        await this.setupSearchAnalytics();
      }
      
      console.log('Atlas Search initialization completed successfully');
      
    } catch (error) {
      console.error('Error initializing Atlas Search:', error);
      throw error;
    }
  }

  async setupSearchCollections() {
    console.log('Setting up search-optimized collections...');
    
    // Documents collection with search-optimized schema
    this.collections.documents = this.db.collection('documents');
    await this.collections.documents.createIndexes([
      { key: { title: 'text', content: 'text' }, background: true, name: 'text_search_fallback' },
      { key: { category: 1, status: 1, publishDate: -1 }, background: true },
      { key: { author: 1, publishDate: -1 }, background: true },
      { key: { tags: 1, language: 1 }, background: true },
      { key: { popularity: -1, relevanceScore: -1 }, background: true }
    ]);
    
    // Search queries and analytics
    this.collections.searchQueries = this.db.collection('search_queries');
    await this.collections.searchQueries.createIndexes([
      { key: { userId: 1, searchTimestamp: -1 }, background: true },
      { key: { queryText: 1, totalResults: -1 }, background: true },
      { key: { searchTimestamp: -1 }, background: true },
      { key: { sessionId: 1, searchTimestamp: -1 }, background: true }
    ]);
    
    // Search analytics aggregation collection
    this.collections.searchAnalytics = this.db.collection('search_analytics');
    await this.collections.searchAnalytics.createIndexes([
      { key: { analysisDate: -1 }, background: true },
      { key: { queryPattern: 1, frequency: -1 }, background: true }
    ]);
    
    // User profiles for personalization
    this.collections.userProfiles = this.db.collection('user_profiles');
    await this.collections.userProfiles.createIndexes([
      { key: { userId: 1 }, unique: true, background: true },
      { key: { 'searchPreferences.categories': 1 }, background: true },
      { key: { lastActivity: -1 }, background: true }
    ]);
    
    console.log('Search collections setup completed');
  }

  async createAtlasSearchIndexes() {
    console.log('Creating Atlas Search indexes...');
    
    // Main document search index with comprehensive text analysis
    const mainSearchIndex = {
      name: 'documents_search_index',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            title: {
              type: 'string',
              analyzer: 'lucene.standard',
              searchAnalyzer: 'lucene.standard',
              highlight: {
                type: 'html'
              }
            },
            content: {
              type: 'string',
              analyzer: 'lucene.standard',
              searchAnalyzer: 'lucene.standard',
              highlight: {
                type: 'html',
                maxCharsToExamine: this.config.highlightMaxChars
              }
            },
            author: {
              type: 'string',
              analyzer: 'lucene.keyword'
            },
            category: {
              type: 'string',
              analyzer: 'lucene.keyword'
            },
            tags: {
              type: 'string',
              analyzer: 'lucene.standard'
            },
            language: {
              type: 'string',
              analyzer: 'lucene.keyword'
            },
            publishDate: {
              type: 'date'
            },
            popularity: {
              type: 'number'
            },
            relevanceScore: {
              type: 'number'
            },
            // Nested content analysis
            sections: {
              type: 'document',
              fields: {
                heading: {
                  type: 'string',
                  analyzer: 'lucene.standard'
                },
                content: {
                  type: 'string',
                  analyzer: 'lucene.standard'
                },
                importance: {
                  type: 'number'
                }
              }
            },
            // Metadata for advanced search
            metadata: {
              type: 'document',
              fields: {
                readingLevel: { type: 'string' },
                contentType: { type: 'string' },
                sourceQuality: { type: 'number' },
                lastUpdated: { type: 'date' }
              }
            }
          }
        },
        analyzers: [{
          name: 'multilingual_analyzer',
          charFilters: [{
            type: 'mapping',
            mappings: {
              '&': 'and',
              '@': 'at'
            }
          }],
          tokenizer: {
            type: 'standard'
          },
          tokenFilters: [
            { type: 'lowercase' },
            { type: 'stop' },
            { type: 'stemmer', language: 'en' }
          ]
        }]
      }
    };
    
    // Autocomplete search index
    const autocompleteIndex = {
      name: 'autocomplete_search_index',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            title: {
              type: 'autocomplete',
              analyzer: 'lucene.standard',
              tokenization: 'edgeGram',
              minGrams: 2,
              maxGrams: 15,
              foldDiacritics: true
            },
            content: {
              type: 'autocomplete',
              analyzer: 'lucene.standard',
              tokenization: 'nGram',
              minGrams: 3,
              maxGrams: 10
            },
            tags: {
              type: 'autocomplete',
              analyzer: 'lucene.keyword',
              tokenization: 'keyword'
            },
            category: {
              type: 'string',
              analyzer: 'lucene.keyword'
            },
            popularity: {
              type: 'number'
            }
          }
        }
      }
    };
    
    // Faceted search index for advanced filtering
    const facetedSearchIndex = {
      name: 'faceted_search_index',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            title: {
              type: 'string',
              analyzer: 'lucene.standard'
            },
            content: {
              type: 'string',
              analyzer: 'lucene.standard'
            },
            category: {
              type: 'stringFacet'
            },
            author: {
              type: 'stringFacet'
            },
            language: {
              type: 'stringFacet'
            },
            tags: {
              type: 'stringFacet'
            },
            publishDate: {
              type: 'dateFacet',
              boundaries: [
                new Date('2020-01-01'),
                new Date('2021-01-01'),
                new Date('2022-01-01'),
                new Date('2023-01-01'),
                new Date('2024-01-01'),
                new Date('2025-01-01')
              ]
            },
            popularity: {
              type: 'numberFacet',
              boundaries: [0, 10, 50, 100, 500, 1000]
            },
            contentLength: {
              type: 'numberFacet',
              boundaries: [0, 1000, 5000, 10000, 50000]
            }
          }
        }
      }
    };
    
    // Store index configurations for reference
    this.searchIndexes.set('main', mainSearchIndex);
    this.searchIndexes.set('autocomplete', autocompleteIndex);
    this.searchIndexes.set('faceted', facetedSearchIndex);
    
    console.log('Atlas Search indexes configured');
    // Note: In production, these indexes would be created through Atlas UI or API
  }

  async performAdvancedTextSearch(query, options = {}) {
    console.log(`Performing advanced text search for: "${query}"`);
    
    const startTime = Date.now();
    
    try {
      // Build comprehensive search aggregation pipeline
      const searchPipeline = [
        {
          $search: {
            index: 'documents_search_index',
            compound: {
              should: [
                // Primary text search with boosting
                {
                  text: {
                    query: query,
                    path: ['title', 'content'],
                    score: {
                      boost: { value: 2.0 }
                    },
                    fuzzy: {
                      maxEdits: 2,
                      prefixLength: 0,
                      maxExpansions: 50
                    }
                  }
                },
                // Exact phrase matching with highest boost
                {
                  phrase: {
                    query: query,
                    path: ['title', 'content'],
                    score: {
                      boost: { value: 3.0 }
                    }
                  }
                },
                // Autocomplete matching for partial queries
                {
                  autocomplete: {
                    query: query,
                    path: 'title',
                    tokenOrder: 'sequential',
                    score: {
                      boost: { value: 1.5 }
                    }
                  }
                },
                // Semantic search using embeddings (if available)
                ...(options.enableSemanticSearch && this.config.enableVectorSearch ? [{
                  knnBeta: {
                    vector: await this.getQueryEmbedding(query),
                    path: 'contentEmbedding',
                    k: 20,
                    score: {
                      boost: { value: 1.2 }
                    }
                  }
                }] : [])
              ],
              
              // Apply filters
              filter: [
                ...(options.category ? [{
                  equals: {
                    path: 'category',
                    value: options.category
                  }
                }] : []),
                ...(options.language ? [{
                  equals: {
                    path: 'language',
                    value: options.language
                  }
                }] : []),
                ...(options.author ? [{
                  text: {
                    query: options.author,
                    path: 'author'
                  }
                }] : []),
                ...(options.dateRange ? [{
                  range: {
                    path: 'publishDate',
                    gte: options.dateRange.start,
                    lte: options.dateRange.end
                  }
                }] : []),
                {
                  equals: {
                    path: 'status',
                    value: 'published'
                  }
                }
              ],
              
              // Boost recent and popular content
              should: [
                {
                  range: {
                    path: 'publishDate',
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                    score: {
                      boost: { value: 1.3 }
                    }
                  }
                },
                {
                  range: {
                    path: 'popularity',
                    gte: 100,
                    score: {
                      boost: { value: 1.2 }
                    }
                  }
                }
              ]
            },
            
            // Add search highlighting
            highlight: {
              path: ['title', 'content'],
              maxCharsToExamine: this.config.highlightMaxChars,
              maxNumPassages: 3
            }
          }
        },
        
        // Add computed fields for search results
        {
          $addFields: {
            searchScore: { $meta: 'searchScore' },
            searchHighlights: { $meta: 'searchHighlights' },
            
            // Calculate content preview
            contentPreview: {
              $substr: ['$content', 0, 300]
            },
            
            // Add relevance indicators
            relevanceIndicators: {
              hasExactMatch: {
                $or: [
                  { $regexMatch: { input: '$title', regex: query, options: 'i' } },
                  { $regexMatch: { input: '$content', regex: query, options: 'i' } }
                ]
              },
              isRecent: {
                $gte: ['$publishDate', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
              },
              isPopular: {
                $gte: ['$popularity', 50]
              }
            }
          }
        },
        
        // Add user personalization (if available)
        ...(options.userId ? [{
          $lookup: {
            from: 'user_profiles',
            localField: 'category',
            foreignField: 'searchPreferences.categories',
            as: 'personalizationMatch',
            pipeline: [
              { $match: { userId: options.userId } },
              { $limit: 1 }
            ]
          }
        }, {
          $addFields: {
            personalizationBoost: {
              $cond: [
                { $gt: [{ $size: '$personalizationMatch' }, 0] },
                1.4,
                1.0
              ]
            },
            finalScore: {
              $multiply: ['$searchScore', '$personalizationBoost']
            }
          }
        }] : [{
          $addFields: {
            finalScore: '$searchScore'
          }
        }]),
        
        // Sort by relevance and apply limits
        { $sort: { finalScore: -1, publishDate: -1 } },
        { $limit: options.limit || this.config.searchResultLimit },
        
        // Project final result structure
        {
          $project: {
            documentId: '$_id',
            title: 1,
            content: { $substr: ['$content', 0, 500] },
            author: 1,
            category: 1,
            tags: 1,
            publishDate: 1,
            language: 1,
            contentPreview: 1,
            
            // Search-specific fields
            searchScore: { $round: ['$finalScore', 4] },
            searchHighlights: 1,
            relevanceIndicators: 1,
            
            // Computed fields
            contentLength: { $strLenCP: '$content' },
            estimatedReadingTime: {
              $round: [{ $divide: [{ $strLenCP: '$content' }, 200] }, 0] // 200 words per minute
            },
            
            // Search result metadata
            searchRank: { $add: [{ $indexOfArray: [[], '$_id'] }, 1] },
            matchQuality: {
              $switch: {
                branches: [
                  { case: { $gte: ['$finalScore', 5.0] }, then: 'excellent' },
                  { case: { $gte: ['$finalScore', 3.0] }, then: 'good' },
                  { case: { $gte: ['$finalScore', 1.0] }, then: 'fair' }
                ],
                default: 'poor'
              }
            }
          }
        }
      ];
      
      // Execute search pipeline
      const searchResults = await this.collections.documents.aggregate(
        searchPipeline,
        { maxTimeMS: 10000 }
      ).toArray();
      
      const executionTime = Date.now() - startTime;
      
      // Log search query for analytics
      await this.logSearchQuery(query, searchResults.length, executionTime, options);
      
      // Update search metrics
      this.updateSearchMetrics(query, searchResults.length, executionTime);
      
      console.log(`Search completed: ${searchResults.length} results in ${executionTime}ms`);
      
      return {
        success: true,
        query: query,
        totalResults: searchResults.length,
        executionTime: executionTime,
        results: searchResults,
        searchMetadata: {
          hasSpellingSuggestions: false, // Would implement spell checking
          appliedFilters: options,
          searchComplexity: 'advanced',
          optimizationsApplied: ['boosting', 'fuzzy_matching', 'highlighting']
        }
      };
      
    } catch (error) {
      console.error('Error performing advanced text search:', error);
      return {
        success: false,
        error: error.message,
        query: query,
        executionTime: Date.now() - startTime
      };
    }
  }

  async setupVectorSearch() {
    console.log('Setting up vector search capabilities...');
    
    // Vector embeddings collection
    this.collections.vectorEmbeddings = this.db.collection('vector_embeddings');
    
    // Vector search index configuration
    const vectorSearchIndex = {
      name: 'vector_search_index',
      definition: {
        fields: [{
          type: 'vector',
          path: 'contentEmbedding',
          numDimensions: 1536, // OpenAI embedding dimensions
          similarity: 'cosine'
        }, {
          type: 'filter',
          path: 'documentId'
        }, {
          type: 'filter',
          path: 'embeddingType'
        }, {
          type: 'filter',
          path: 'language'
        }]
      }
    };
    
    this.vectorIndexes.set('content_vectors', vectorSearchIndex);
    
    // Create indexes for vector collection
    await this.collections.vectorEmbeddings.createIndexes([
      { key: { documentId: 1 }, unique: true, background: true },
      { key: { embeddingType: 1, language: 1 }, background: true },
      { key: { createdAt: -1 }, background: true }
    ]);
    
    console.log('Vector search setup completed');
  }

  async performVectorSearch(queryEmbedding, options = {}) {
    console.log('Performing vector similarity search...');
    
    const startTime = Date.now();
    
    try {
      const vectorSearchPipeline = [
        {
          $vectorSearch: {
            index: 'vector_search_index',
            path: 'contentEmbedding',
            queryVector: queryEmbedding,
            numCandidates: options.numCandidates || 100,
            limit: options.limit || 20,
            filter: {
              ...(options.language && { language: { $eq: options.language } }),
              ...(options.embeddingType && { embeddingType: { $eq: options.embeddingType } })
            }
          }
        },
        
        // Join with original documents
        {
          $lookup: {
            from: 'documents',
            localField: 'documentId',
            foreignField: '_id',
            as: 'document'
          }
        },
        
        // Unwind and add computed fields
        { $unwind: '$document' },
        {
          $addFields: {
            similarityScore: { $meta: 'vectorSearchScore' },
            semanticRelevance: {
              $switch: {
                branches: [
                  { case: { $gte: [{ $meta: 'vectorSearchScore' }, 0.8] }, then: 'very_high' },
                  { case: { $gte: [{ $meta: 'vectorSearchScore' }, 0.6] }, then: 'high' },
                  { case: { $gte: [{ $meta: 'vectorSearchScore' }, 0.4] }, then: 'medium' }
                ],
                default: 'low'
              }
            }
          }
        },
        
        // Project results
        {
          $project: {
            documentId: '$document._id',
            title: '$document.title',
            content: { $substr: ['$document.content', 0, 400] },
            author: '$document.author',
            category: '$document.category',
            similarityScore: { $round: ['$similarityScore', 4] },
            semanticRelevance: 1,
            embeddingType: 1,
            language: 1
          }
        }
      ];
      
      const vectorResults = await this.collections.vectorEmbeddings.aggregate(
        vectorSearchPipeline,
        { maxTimeMS: 15000 }
      ).toArray();
      
      const executionTime = Date.now() - startTime;
      
      console.log(`Vector search completed: ${vectorResults.length} results in ${executionTime}ms`);
      
      return {
        success: true,
        totalResults: vectorResults.length,
        executionTime: executionTime,
        results: vectorResults,
        searchType: 'vector_similarity'
      };
      
    } catch (error) {
      console.error('Error performing vector search:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  async performFacetedSearch(query, options = {}) {
    console.log(`Performing faceted search for: "${query}"`);
    
    const startTime = Date.now();
    
    try {
      const facetedSearchPipeline = [
        {
          $searchMeta: {
            index: 'faceted_search_index',
            facet: {
              operator: {
                text: {
                  query: query,
                  path: ['title', 'content']
                }
              },
              facets: {
                // Category facets
                categoriesFacet: {
                  type: 'string',
                  path: 'category',
                  numBuckets: this.config.facetLimit
                },
                
                // Author facets
                authorsFacet: {
                  type: 'string',
                  path: 'author',
                  numBuckets: 10
                },
                
                // Language facets
                languagesFacet: {
                  type: 'string',
                  path: 'language',
                  numBuckets: 10
                },
                
                // Date range facets
                publishDateFacet: {
                  type: 'date',
                  path: 'publishDate',
                  boundaries: [
                    new Date('2020-01-01'),
                    new Date('2021-01-01'),
                    new Date('2022-01-01'),
                    new Date('2023-01-01'),
                    new Date('2024-01-01'),
                    new Date('2025-01-01')
                  ]
                },
                
                // Popularity range facets
                popularityFacet: {
                  type: 'number',
                  path: 'popularity',
                  boundaries: [0, 10, 50, 100, 500, 1000]
                },
                
                // Content length facets
                contentLengthFacet: {
                  type: 'number',
                  path: 'contentLength',
                  boundaries: [0, 1000, 5000, 10000, 50000]
                }
              }
            }
          }
        }
      ];
      
      const facetResults = await this.collections.documents.aggregate(
        facetedSearchPipeline
      ).toArray();
      
      const executionTime = Date.now() - startTime;
      
      console.log(`Faceted search completed in ${executionTime}ms`);
      
      return {
        success: true,
        query: query,
        executionTime: executionTime,
        facets: facetResults[0]?.facet || {},
        searchType: 'faceted'
      };
      
    } catch (error) {
      console.error('Error performing faceted search:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  async generateAutocompleteResults(partialQuery, options = {}) {
    console.log(`Generating autocomplete for: "${partialQuery}"`);
    
    try {
      const autocompletePipeline = [
        {
          $search: {
            index: 'autocomplete_search_index',
            compound: {
              should: [
                {
                  autocomplete: {
                    query: partialQuery,
                    path: 'title',
                    tokenOrder: 'sequential',
                    score: { boost: { value: 2.0 } }
                  }
                },
                {
                  autocomplete: {
                    query: partialQuery,
                    path: 'tags',
                    tokenOrder: 'any',
                    score: { boost: { value: 1.5 } }
                  }
                }
              ],
              filter: [
                { equals: { path: 'status', value: 'published' } },
                ...(options.category ? [{ equals: { path: 'category', value: options.category } }] : [])
              ]
            }
          }
        },
        
        { $limit: 10 },
        
        {
          $project: {
            suggestion: '$title',
            category: 1,
            popularity: 1,
            autocompleteScore: { $meta: 'searchScore' }
          }
        },
        
        { $sort: { autocompleteScore: -1, popularity: -1 } }
      ];
      
      const suggestions = await this.collections.documents.aggregate(
        autocompletePipeline
      ).toArray();
      
      return {
        success: true,
        partialQuery: partialQuery,
        suggestions: suggestions.map(s => ({
          text: s.suggestion,
          category: s.category,
          score: s.autocompleteScore
        }))
      };
      
    } catch (error) {
      console.error('Error generating autocomplete results:', error);
      return {
        success: false,
        error: error.message,
        suggestions: []
      };
    }
  }

  async logSearchQuery(query, resultCount, executionTime, options) {
    try {
      const searchLog = {
        queryId: new ObjectId(),
        queryText: query,
        queryLanguage: options.language || 'en',
        userId: options.userId,
        sessionId: options.sessionId,
        
        // Search parameters
        filtersApplied: {
          category: options.category,
          author: options.author,
          language: options.language,
          dateRange: options.dateRange
        },
        
        // Search results metrics
        totalResultsFound: resultCount,
        executionTimeMs: executionTime,
        searchType: options.searchType || 'text',
        
        // Context information
        userAgent: options.userAgent,
        referrer: options.referrer,
        searchTimestamp: new Date(),
        
        // Performance data
        indexesUsed: ['documents_search_index'],
        optimizationsApplied: ['boosting', 'highlighting', 'fuzzy_matching'],
        
        // Quality metrics (to be updated by user interaction)
        userInteraction: {
          resultsClicked: [],
          timeOnResultsPage: null,
          refinedQuery: null,
          conversionAchieved: false
        }
      };
      
      await this.collections.searchQueries.insertOne(searchLog);
      
    } catch (error) {
      console.error('Error logging search query:', error);
    }
  }

  updateSearchMetrics(query, resultCount, executionTime) {
    this.searchMetrics.totalSearches++;
    this.searchMetrics.averageLatency = 
      (this.searchMetrics.averageLatency + executionTime) / 2;
    
    if (resultCount > 0) {
      this.searchMetrics.searchesWithResults++;
    }
    
    // Track popular queries
    const queryLower = query.toLowerCase();
    this.searchMetrics.popularQueries.set(
      queryLower,
      (this.searchMetrics.popularQueries.get(queryLower) || 0) + 1
    );
  }

  async getQueryEmbedding(query) {
    // Placeholder for actual embedding generation
    // In production, this would call OpenAI API or similar service
    return Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  async getSearchAnalytics(timeRange = '7d') {
    console.log(`Retrieving search analytics for ${timeRange}...`);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '1d':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }
      
      const analyticsAggregation = [
        {
          $match: {
            searchTimestamp: { $gte: startDate, $lte: endDate }
          }
        },
        
        {
          $group: {
            _id: null,
            totalSearches: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
            averageExecutionTime: { $avg: '$executionTimeMs' },
            searchesWithResults: {
              $sum: { $cond: [{ $gt: ['$totalResultsFound', 0] }, 1, 0] }
            },
            
            // Query analysis
            popularQueries: {
              $push: {
                query: '$queryText',
                results: '$totalResultsFound',
                executionTime: '$executionTimeMs'
              }
            },
            
            // Performance metrics
            maxExecutionTime: { $max: '$executionTimeMs' },
            minExecutionTime: { $min: '$executionTimeMs' },
            
            // Filter usage analysis
            categoryFilters: { $push: '$filtersApplied.category' },
            languageFilters: { $push: '$filtersApplied.language' }
          }
        },
        
        {
          $addFields: {
            uniqueUserCount: { $size: '$uniqueUsers' },
            successRate: {
              $round: [
                { $multiply: [
                  { $divide: ['$searchesWithResults', '$totalSearches'] },
                  100
                ]},
                2
              ]
            },
            averageExecutionTimeRounded: {
              $round: ['$averageExecutionTime', 2]
            }
          }
        }
      ];
      
      const analytics = await this.collections.searchQueries.aggregate(
        analyticsAggregation
      ).toArray();
      
      return {
        success: true,
        timeRange: timeRange,
        analytics: analytics[0] || {
          totalSearches: 0,
          uniqueUserCount: 0,
          successRate: 0,
          averageExecutionTimeRounded: 0
        },
        systemMetrics: this.searchMetrics
      };
      
    } catch (error) {
      console.error('Error retrieving search analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async shutdown() {
    console.log('Shutting down Atlas Search Manager...');
    
    if (this.client) {
      await this.client.close();
    }
    
    console.log('Atlas Search Manager shutdown complete');
  }
}

// Benefits of MongoDB Atlas Search:
// - Native full-text search with no external dependencies
// - Advanced relevance scoring with machine learning integration
// - Vector similarity search for semantic understanding
// - Multi-language support with sophisticated text analysis
// - Real-time search index synchronization
// - Faceted search and advanced filtering capabilities
// - Autocomplete and search suggestions out-of-the-box
// - Comprehensive search analytics and performance monitoring
// - SQL-compatible search operations through QueryLeaf integration

module.exports = {
  AtlasSearchManager
};
```

## Understanding MongoDB Atlas Search Architecture

### Advanced Search Patterns and Performance Optimization

Implement sophisticated search strategies for production MongoDB Atlas deployments:

```javascript
// Production-ready Atlas Search with advanced features and optimization
class EnterpriseAtlasSearchProcessor extends AtlasSearchManager {
  constructor(connectionString, enterpriseConfig) {
    super(connectionString, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      enableAdvancedAnalytics: true,
      enablePersonalization: true,
      enableA_B_Testing: true,
      enableSearchOptimization: true,
      enableContentIntelligence: true,
      enableMultiModalSearch: true
    };
    
    this.setupEnterpriseFeatures();
    this.initializeAdvancedAnalytics();
    this.setupPersonalizationEngine();
  }

  async implementAdvancedSearchStrategies() {
    console.log('Implementing enterprise search strategies...');
    
    const searchStrategies = {
      // Multi-modal search capabilities
      multiModalSearch: {
        textSearch: true,
        vectorSearch: true,
        imageSearch: true,
        documentSearch: true,
        semanticSearch: true
      },
      
      // Personalization engine
      personalizationEngine: {
        userBehaviorAnalysis: true,
        contentRecommendations: true,
        adaptiveScoringWeights: true,
        searchIntentPrediction: true
      },
      
      // Search optimization
      searchOptimization: {
        realTimeIndexOptimization: true,
        queryPerformanceAnalysis: true,
        automaticRelevanceTuning: true,
        resourceUtilizationOptimization: true
      }
    };

    return await this.deployEnterpriseSearchStrategies(searchStrategies);
  }

  async setupAdvancedPersonalization() {
    console.log('Setting up advanced personalization capabilities...');
    
    const personalizationConfig = {
      // User modeling
      userModeling: {
        behavioralTracking: true,
        preferenceAnalysis: true,
        contextualUnderstanding: true,
        intentPrediction: true
      },
      
      // Content intelligence
      contentIntelligence: {
        topicModeling: true,
        contentCategorization: true,
        qualityScoring: true,
        freshnessScorig: true
      },
      
      // Adaptive algorithms
      adaptiveAlgorithms: {
        learningFromInteraction: true,
        realTimeAdaptation: true,
        contextualAdjustment: true,
        performanceOptimization: true
      }
    };

    return await this.deployPersonalizationEngine(personalizationConfig);
  }
}
```

## SQL-Style Search Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Atlas Search operations:

```sql
-- QueryLeaf Atlas Search operations with SQL-familiar syntax

-- Configure comprehensive search indexes
CREATE SEARCH INDEX documents_main_index ON documents (
  title WITH (
    analyzer = 'standard',
    search_analyzer = 'standard',
    highlight = true,
    boost = 2.0
  ),
  content WITH (
    analyzer = 'standard', 
    search_analyzer = 'standard',
    highlight = true,
    max_highlight_chars = 500
  ),
  author WITH (
    analyzer = 'keyword',
    facet = true
  ),
  category WITH (
    analyzer = 'keyword',
    facet = true
  ),
  tags WITH (
    analyzer = 'standard',
    facet = true
  ),
  language WITH (
    analyzer = 'keyword',
    facet = true
  ),
  publish_date WITH (
    type = 'date',
    facet = true
  ),
  popularity WITH (
    type = 'number',
    facet = true,
    facet_boundaries = [0, 10, 50, 100, 500, 1000]
  )
)
WITH SEARCH_OPTIONS (
  enable_highlighting = true,
  enable_faceting = true,
  enable_autocomplete = true,
  enable_fuzzy_matching = true,
  default_language = 'english'
);

-- Create autocomplete search index
CREATE AUTOCOMPLETE INDEX documents_autocomplete ON documents (
  title WITH (
    tokenization = 'edgeGram',
    min_grams = 2,
    max_grams = 15,
    fold_diacritics = true
  ),
  tags WITH (
    tokenization = 'keyword',
    max_suggestions = 20
  )
);

-- Create vector search index for semantic search
CREATE VECTOR INDEX documents_semantic ON documents (
  content_embedding WITH (
    dimensions = 1536,
    similarity = 'cosine'
  )
)
WITH VECTOR_OPTIONS (
  num_candidates = 100,
  enable_filtering = true
);

-- Advanced text search with comprehensive features
WITH advanced_search AS (
  SELECT 
    document_id,
    title,
    content,
    author,
    category,
    tags,
    publish_date,
    language,
    popularity,
    
    -- Search scoring and ranking
    SEARCH_SCORE() as relevance_score,
    SEARCH_HIGHLIGHTS(title, content) as search_highlights,
    
    -- Advanced scoring components
    CASE 
      WHEN SEARCH_EXACT_MATCH(title, 'machine learning') THEN 3.0
      WHEN SEARCH_PHRASE_MATCH(content, 'machine learning') THEN 2.5
      WHEN SEARCH_FUZZY_MATCH(title, 'machine learning', max_edits = 2) THEN 1.8
      ELSE 1.0
    END as match_type_boost,
    
    -- Temporal and popularity boosts
    CASE 
      WHEN publish_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1.3
      WHEN publish_date >= CURRENT_DATE - INTERVAL '90 days' THEN 1.1
      ELSE 1.0
    END as recency_boost,
    
    CASE 
      WHEN popularity >= 1000 THEN 1.4
      WHEN popularity >= 100 THEN 1.2
      WHEN popularity >= 10 THEN 1.1
      ELSE 1.0
    END as popularity_boost,
    
    -- Content quality indicators
    LENGTH(content) as content_length,
    ARRAY_LENGTH(tags, 1) as tag_count,
    EXTRACT(DAYS FROM CURRENT_DATE - publish_date) as days_old
    
  FROM documents
  WHERE SEARCH(
    -- Primary search query
    query = 'machine learning artificial intelligence',
    paths = ['title', 'content'],
    
    -- Search options
    WITH (
      fuzzy_matching = true,
      max_edits = 2,
      prefix_length = 2,
      enable_highlighting = true,
      highlight_max_chars = 500,
      
      -- Boost strategies
      title_boost = 2.0,
      exact_phrase_boost = 3.0,
      proximity_boost = 1.5
    ),
    
    -- Filters
    AND category IN ('technology', 'science', 'research')
    AND language = 'en'
    AND status = 'published'
    AND publish_date >= '2020-01-01'
  )
),

search_with_personalization AS (
  SELECT 
    ads.*,
    
    -- User personalization (if user context available)
    CASE 
      WHEN USER_PREFERENCE_MATCH(category, user_id = 'user123') THEN 1.4
      WHEN USER_INTERACTION_HISTORY(document_id, user_id = 'user123', 
                                   interaction_type = 'positive') THEN 1.3
      ELSE 1.0
    END as personalization_boost,
    
    -- Final relevance calculation
    (relevance_score * match_type_boost * recency_boost * 
     popularity_boost * personalization_boost) as final_relevance_score,
    
    -- Search result enrichment
    CASE 
      WHEN final_relevance_score >= 8.0 THEN 'excellent'
      WHEN final_relevance_score >= 5.0 THEN 'very_good'
      WHEN final_relevance_score >= 3.0 THEN 'good'
      WHEN final_relevance_score >= 1.0 THEN 'fair'
      ELSE 'poor'
    END as match_quality,
    
    -- Estimated reading time
    ROUND(content_length / 200.0, 0) as estimated_reading_minutes,
    
    -- Search result categories
    CASE 
      WHEN SEARCH_EXACT_MATCH(title, 'machine learning') OR 
           SEARCH_EXACT_MATCH(content, 'machine learning') THEN 'exact_match'
      WHEN SEARCH_SEMANTIC_SIMILARITY(content_embedding, 
                                      QUERY_EMBEDDING('machine learning artificial intelligence')) > 0.8 
           THEN 'semantic_match'
      WHEN SEARCH_FUZZY_MATCH(title, 'machine learning', max_edits = 2) THEN 'fuzzy_match'
      ELSE 'keyword_match'
    END as match_type
    
  FROM advanced_search ads
),

faceted_analysis AS (
  -- Generate search facets for filtering UI
  SELECT 
    'categories' as facet_type,
    category as facet_value,
    COUNT(*) as result_count,
    AVG(final_relevance_score) as avg_relevance
  FROM search_with_personalization
  GROUP BY category
  
  UNION ALL
  
  SELECT 
    'authors' as facet_type,
    author as facet_value,
    COUNT(*) as result_count,
    AVG(final_relevance_score) as avg_relevance
  FROM search_with_personalization
  GROUP BY author
  
  UNION ALL
  
  SELECT 
    'languages' as facet_type,
    language as facet_value,
    COUNT(*) as result_count,
    AVG(final_relevance_score) as avg_relevance
  FROM search_with_personalization
  GROUP BY language
  
  UNION ALL
  
  SELECT 
    'time_periods' as facet_type,
    CASE 
      WHEN publish_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'last_month'
      WHEN publish_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'last_3_months'
      WHEN publish_date >= CURRENT_DATE - INTERVAL '365 days' THEN 'last_year'
      ELSE 'older'
    END as facet_value,
    COUNT(*) as result_count,
    AVG(final_relevance_score) as avg_relevance
  FROM search_with_personalization
  GROUP BY facet_value
  
  UNION ALL
  
  SELECT 
    'popularity_ranges' as facet_type,
    CASE 
      WHEN popularity >= 1000 THEN 'very_popular'
      WHEN popularity >= 100 THEN 'popular'
      WHEN popularity >= 10 THEN 'moderate'
      ELSE 'emerging'
    END as facet_value,
    COUNT(*) as result_count,
    AVG(final_relevance_score) as avg_relevance
  FROM search_with_personalization
  GROUP BY facet_value
),

search_analytics AS (
  -- Real-time search analytics
  SELECT 
    'search_performance' as metric_type,
    COUNT(*) as total_results,
    AVG(final_relevance_score) as avg_relevance,
    MAX(final_relevance_score) as max_relevance,
    COUNT(*) FILTER (WHERE match_quality IN ('excellent', 'very_good')) as high_quality_results,
    COUNT(DISTINCT category) as categories_represented,
    COUNT(DISTINCT author) as authors_represented,
    COUNT(DISTINCT language) as languages_represented,
    
    -- Match type distribution
    COUNT(*) FILTER (WHERE match_type = 'exact_match') as exact_matches,
    COUNT(*) FILTER (WHERE match_type = 'semantic_match') as semantic_matches,
    COUNT(*) FILTER (WHERE match_type = 'fuzzy_match') as fuzzy_matches,
    COUNT(*) FILTER (WHERE match_type = 'keyword_match') as keyword_matches,
    
    -- Content characteristics
    AVG(content_length) as avg_content_length,
    AVG(estimated_reading_minutes) as avg_reading_time,
    AVG(days_old) as avg_content_age_days,
    
    -- Search quality indicators
    ROUND((COUNT(*) FILTER (WHERE match_quality IN ('excellent', 'very_good'))::DECIMAL / COUNT(*)) * 100, 2) as high_quality_percentage,
    ROUND((COUNT(*) FILTER (WHERE final_relevance_score >= 3.0)::DECIMAL / COUNT(*)) * 100, 2) as relevant_results_percentage
    
  FROM search_with_personalization
)

-- Main search results output
SELECT 
  swp.document_id,
  swp.title,
  LEFT(swp.content, 300) || '...' as content_preview,
  swp.author,
  swp.category,
  swp.tags,
  swp.publish_date,
  swp.language,
  
  -- Relevance and ranking
  ROUND(swp.final_relevance_score, 4) as relevance_score,
  ROW_NUMBER() OVER (ORDER BY swp.final_relevance_score DESC, swp.publish_date DESC) as search_rank,
  swp.match_quality,
  swp.match_type,
  
  -- Search highlights
  swp.search_highlights,
  
  -- Content metadata
  swp.content_length,
  swp.estimated_reading_minutes,
  swp.tag_count,
  swp.days_old,
  
  -- User personalization indicators
  ROUND(swp.personalization_boost, 2) as personalization_factor,
  
  -- Additional context
  CASE 
    WHEN swp.days_old <= 7 THEN 'Very Recent'
    WHEN swp.days_old <= 30 THEN 'Recent'
    WHEN swp.days_old <= 90 THEN 'Moderate'
    ELSE 'Archive'
  END as content_freshness,
  
  -- Search result recommendations
  CASE 
    WHEN swp.match_quality = 'excellent' AND swp.match_type = 'exact_match' THEN 'Must Read'
    WHEN swp.match_quality IN ('very_good', 'excellent') AND swp.days_old <= 30 THEN 'Trending'
    WHEN swp.match_quality = 'good' AND swp.popularity >= 100 THEN 'Popular Choice'
    WHEN swp.match_type = 'semantic_match' THEN 'Related Content'
    ELSE 'Standard Result'
  END as result_recommendation

FROM search_with_personalization swp
WHERE swp.final_relevance_score >= 0.5  -- Filter low-relevance results
ORDER BY swp.final_relevance_score DESC, swp.publish_date DESC
LIMIT 50;

-- Vector similarity search with SQL syntax
WITH semantic_search AS (
  SELECT 
    document_id,
    title,
    content,
    author,
    category,
    
    -- Vector similarity scoring
    VECTOR_SIMILARITY(
      content_embedding, 
      QUERY_EMBEDDING('artificial intelligence machine learning deep learning neural networks'),
      similarity_method = 'cosine'
    ) as semantic_similarity_score,
    
    -- Semantic relevance classification
    CASE 
      WHEN VECTOR_SIMILARITY(content_embedding, QUERY_EMBEDDING(...)) >= 0.9 THEN 'extremely_relevant'
      WHEN VECTOR_SIMILARITY(content_embedding, QUERY_EMBEDDING(...)) >= 0.8 THEN 'highly_relevant'
      WHEN VECTOR_SIMILARITY(content_embedding, QUERY_EMBEDDING(...)) >= 0.7 THEN 'relevant'
      WHEN VECTOR_SIMILARITY(content_embedding, QUERY_EMBEDDING(...)) >= 0.6 THEN 'somewhat_relevant'
      ELSE 'marginally_relevant'
    END as semantic_relevance_level
    
  FROM documents
  WHERE VECTOR_SEARCH(
    embedding_field = content_embedding,
    query_vector = QUERY_EMBEDDING('artificial intelligence machine learning deep learning neural networks'),
    similarity_threshold = 0.6,
    max_results = 20,
    
    -- Additional filters
    AND status = 'published'
    AND language IN ('en', 'es', 'fr')
    AND publish_date >= '2021-01-01'
  )
),

hybrid_search_results AS (
  -- Combine text search and vector search for optimal results
  SELECT 
    document_id,
    title,
    content,
    author,
    category,
    publish_date,
    
    -- Combined scoring from multiple search methods
    COALESCE(text_search.final_relevance_score, 0) as text_relevance,
    COALESCE(semantic_search.semantic_similarity_score, 0) as semantic_relevance,
    
    -- Hybrid relevance calculation
    (
      COALESCE(text_search.final_relevance_score, 0) * 0.6 +
      COALESCE(semantic_search.semantic_similarity_score * 10, 0) * 0.4
    ) as hybrid_relevance_score,
    
    -- Search method indicators
    CASE 
      WHEN text_search.document_id IS NOT NULL AND semantic_search.document_id IS NOT NULL THEN 'hybrid_match'
      WHEN text_search.document_id IS NOT NULL THEN 'text_match'
      WHEN semantic_search.document_id IS NOT NULL THEN 'semantic_match'
      ELSE 'no_match'
    END as search_method,
    
    -- Quality indicators
    text_search.match_quality as text_match_quality,
    semantic_search.semantic_relevance_level as semantic_match_quality
    
  FROM (
    SELECT DISTINCT document_id FROM search_with_personalization 
    UNION 
    SELECT DISTINCT document_id FROM semantic_search
  ) all_results
  LEFT JOIN search_with_personalization text_search ON all_results.document_id = text_search.document_id
  LEFT JOIN semantic_search ON all_results.document_id = semantic_search.document_id
  JOIN documents d ON all_results.document_id = d.document_id
)

SELECT 
  hrs.document_id,
  hrs.title,
  LEFT(hrs.content, 400) as content_preview,
  hrs.author,
  hrs.category,
  hrs.publish_date,
  
  -- Hybrid scoring results
  ROUND(hrs.text_relevance, 4) as text_relevance_score,
  ROUND(hrs.semantic_relevance, 4) as semantic_relevance_score,
  ROUND(hrs.hybrid_relevance_score, 4) as combined_relevance_score,
  
  -- Search method and quality
  hrs.search_method,
  COALESCE(hrs.text_match_quality, 'n/a') as text_quality,
  COALESCE(hrs.semantic_match_quality, 'n/a') as semantic_quality,
  
  -- Final recommendation
  CASE 
    WHEN hrs.hybrid_relevance_score >= 8.0 THEN 'Highly Recommended'
    WHEN hrs.hybrid_relevance_score >= 6.0 THEN 'Recommended'
    WHEN hrs.hybrid_relevance_score >= 4.0 THEN 'Relevant'
    WHEN hrs.hybrid_relevance_score >= 2.0 THEN 'Potentially Interesting'
    ELSE 'Marginally Relevant'
  END as recommendation_level

FROM hybrid_search_results hrs
WHERE hrs.hybrid_relevance_score >= 1.0
ORDER BY hrs.hybrid_relevance_score DESC, hrs.publish_date DESC
LIMIT 25;

-- Autocomplete and search suggestions
SELECT 
  suggestion_text,
  suggestion_category,
  popularity_score,
  completion_frequency,
  
  -- Suggestion quality metrics
  AUTOCOMPLETE_SCORE('machine lear', suggestion_text) as completion_relevance,
  
  -- Suggestion type classification
  CASE 
    WHEN STARTS_WITH(suggestion_text, 'machine lear') THEN 'prefix_completion'
    WHEN CONTAINS(suggestion_text, 'machine learning') THEN 'phrase_completion'
    WHEN FUZZY_MATCH(suggestion_text, 'machine learning', max_distance = 2) THEN 'corrected_completion'
    ELSE 'related_suggestion'
  END as suggestion_type,
  
  -- User context enhancement
  CASE 
    WHEN USER_SEARCH_HISTORY_CONTAINS('user123', suggestion_text) THEN true
    ELSE false
  END as user_has_searched_before,
  
  -- Trending indicator
  CASE 
    WHEN TRENDING_SEARCH_TERM(suggestion_text, time_window = '7d') THEN 'trending'
    WHEN POPULAR_SEARCH_TERM(suggestion_text, time_window = '30d') THEN 'popular'
    ELSE 'standard'
  END as trend_status

FROM AUTOCOMPLETE_SUGGESTIONS(
  partial_query = 'machine lear',
  max_suggestions = 10,
  
  -- Personalization options
  user_id = 'user123',
  include_user_history = true,
  include_trending = true,
  
  -- Filtering options
  category_filter = 'technology',
  language_filter = 'en',
  min_popularity = 10
)
ORDER BY completion_relevance DESC, popularity_score DESC;

-- Search analytics and performance monitoring
WITH search_performance_analysis AS (
  SELECT 
    DATE_TRUNC('hour', search_timestamp) as hour_bucket,
    COUNT(*) as total_searches,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(execution_time_ms) as avg_execution_time,
    AVG(total_results_found) as avg_results_count,
    
    -- Search success metrics
    COUNT(*) FILTER (WHERE total_results_found > 0) as successful_searches,
    COUNT(*) FILTER (WHERE total_results_found >= 10) as highly_successful_searches,
    
    -- Query complexity analysis
    AVG(LENGTH(query_text)) as avg_query_length,
    COUNT(*) FILTER (WHERE filters_applied IS NOT NULL) as searches_with_filters,
    
    -- Performance categories
    COUNT(*) FILTER (WHERE execution_time_ms <= 100) as fast_searches,
    COUNT(*) FILTER (WHERE execution_time_ms > 100 AND execution_time_ms <= 500) as moderate_searches,
    COUNT(*) FILTER (WHERE execution_time_ms > 500) as slow_searches,
    
    -- Search types
    COUNT(*) FILTER (WHERE search_type = 'text') as text_searches,
    COUNT(*) FILTER (WHERE search_type = 'vector') as vector_searches,
    COUNT(*) FILTER (WHERE search_type = 'hybrid') as hybrid_searches,
    COUNT(*) FILTER (WHERE search_type = 'autocomplete') as autocomplete_requests
    
  FROM search_queries
  WHERE search_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', search_timestamp)
),

query_pattern_analysis AS (
  SELECT 
    query_text,
    COUNT(*) as query_frequency,
    AVG(total_results_found) as avg_results,
    AVG(execution_time_ms) as avg_execution_time,
    COUNT(DISTINCT user_id) as unique_users,
    
    -- Query success metrics
    ROUND((COUNT(*) FILTER (WHERE total_results_found > 0)::DECIMAL / COUNT(*)) * 100, 2) as success_rate,
    
    -- User engagement indicators
    AVG(ARRAY_LENGTH(user_interaction.results_clicked, 1)) as avg_clicks_per_search,
    COUNT(*) FILTER (WHERE user_interaction.conversion_achieved = true) as conversions,
    
    -- Query characteristics
    LENGTH(query_text) as query_length,
    ARRAY_LENGTH(STRING_TO_ARRAY(query_text, ' '), 1) as word_count,
    
    -- Classification
    CASE 
      WHEN LENGTH(query_text) <= 10 THEN 'short_query'
      WHEN LENGTH(query_text) <= 30 THEN 'medium_query'
      ELSE 'long_query'
    END as query_length_category,
    
    CASE 
      WHEN ARRAY_LENGTH(STRING_TO_ARRAY(query_text, ' '), 1) = 1 THEN 'single_word'
      WHEN ARRAY_LENGTH(STRING_TO_ARRAY(query_text, ' '), 1) <= 3 THEN 'short_phrase'
      WHEN ARRAY_LENGTH(STRING_TO_ARRAY(query_text, ' '), 1) <= 6 THEN 'medium_phrase'
      ELSE 'long_phrase'
    END as query_complexity
    
  FROM search_queries
  WHERE search_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY query_text
  HAVING COUNT(*) >= 3  -- Focus on repeated queries
)

-- Comprehensive search analytics report
SELECT 
  -- Time-based performance
  spa.hour_bucket,
  spa.total_searches,
  spa.unique_users,
  spa.avg_execution_time,
  spa.avg_results_count,
  
  -- Success metrics
  ROUND((spa.successful_searches::DECIMAL / spa.total_searches) * 100, 2) as success_rate_percent,
  ROUND((spa.highly_successful_searches::DECIMAL / spa.total_searches) * 100, 2) as high_success_rate_percent,
  
  -- Performance distribution
  ROUND((spa.fast_searches::DECIMAL / spa.total_searches) * 100, 2) as fast_search_percent,
  ROUND((spa.moderate_searches::DECIMAL / spa.total_searches) * 100, 2) as moderate_search_percent,
  ROUND((spa.slow_searches::DECIMAL / spa.total_searches) * 100, 2) as slow_search_percent,
  
  -- Search type distribution
  ROUND((spa.text_searches::DECIMAL / spa.total_searches) * 100, 2) as text_search_percent,
  ROUND((spa.vector_searches::DECIMAL / spa.total_searches) * 100, 2) as vector_search_percent,
  ROUND((spa.hybrid_searches::DECIMAL / spa.total_searches) * 100, 2) as hybrid_search_percent,
  
  -- User engagement
  ROUND(spa.searches_with_filters::DECIMAL / spa.total_searches * 100, 2) as filter_usage_percent,
  spa.avg_query_length,
  
  -- Performance assessment
  CASE 
    WHEN spa.avg_execution_time <= 100 THEN 'excellent'
    WHEN spa.avg_execution_time <= 300 THEN 'good'
    WHEN spa.avg_execution_time <= 800 THEN 'fair'
    ELSE 'needs_improvement'
  END as performance_rating,
  
  -- System health indicators
  CASE 
    WHEN (spa.successful_searches::DECIMAL / spa.total_searches) >= 0.9 THEN 'healthy'
    WHEN (spa.successful_searches::DECIMAL / spa.total_searches) >= 0.7 THEN 'moderate'
    ELSE 'concerning'
  END as system_health_status

FROM search_performance_analysis spa
ORDER BY spa.hour_bucket DESC;

-- Popular and problematic queries analysis
SELECT 
  'popular_queries' as analysis_type,
  qpa.query_text,
  qpa.query_frequency,
  qpa.success_rate,
  qpa.avg_results,
  qpa.avg_execution_time,
  qpa.unique_users,
  qpa.query_length_category,
  qpa.query_complexity,
  
  -- Recommendations
  CASE 
    WHEN qpa.success_rate < 50 THEN 'Investigate low success rate'
    WHEN qpa.avg_execution_time > 1000 THEN 'Optimize query performance'
    WHEN qpa.avg_results < 5 THEN 'Improve result relevance'
    WHEN qpa.conversions = 0 THEN 'Enhance result quality'
    ELSE 'Query performing well'
  END as recommendation

FROM query_pattern_analysis qpa
WHERE qpa.query_frequency >= 10
ORDER BY qpa.query_frequency DESC
LIMIT 20;

-- QueryLeaf provides comprehensive search capabilities:
-- 1. SQL-familiar syntax for Atlas Search index creation and management
-- 2. Advanced full-text search with fuzzy matching, highlighting, and boosting
-- 3. Vector similarity search for semantic understanding
-- 4. Faceted search and filtering with automatic facet generation
-- 5. Autocomplete and search suggestions with personalization
-- 6. Hybrid search combining multiple search methodologies
-- 7. Real-time search analytics and performance monitoring
-- 8. Integration with MongoDB's native Atlas Search optimizations
-- 9. Multi-language support and advanced text analysis
-- 10. Production-ready search capabilities with familiar SQL syntax
```

## Best Practices for Atlas Search Implementation

### Search Index Strategy and Performance Optimization

Essential principles for effective Atlas Search deployment:

1. **Index Design**: Create search indexes that balance functionality with performance, optimizing for your most common query patterns
2. **Query Optimization**: Structure search queries to leverage Atlas Search's advanced capabilities while maintaining fast response times
3. **Relevance Tuning**: Implement sophisticated relevance scoring that combines multiple factors for optimal search results
4. **Multi-Language Support**: Design search indexes and queries to handle multiple languages and character sets effectively
5. **Performance Monitoring**: Establish comprehensive search analytics to track performance and user behavior
6. **Vector Integration**: Leverage vector search for semantic understanding and enhanced search relevance

### Production Search Architecture

Design search systems for enterprise-scale requirements:

1. **Scalable Architecture**: Implement search infrastructure that can handle high query volumes and large datasets
2. **Advanced Analytics**: Deploy comprehensive search analytics with user behavior tracking and performance optimization
3. **Personalization Engine**: Integrate machine learning-based personalization for improved search relevance
4. **Multi-Modal Search**: Support various search types including text, semantic, and multimedia search capabilities
5. **Real-Time Optimization**: Implement automated search optimization based on usage patterns and performance metrics
6. **Security Integration**: Ensure search implementations respect data access controls and privacy requirements

## Conclusion

MongoDB Atlas Search provides comprehensive native search capabilities that eliminate the complexity of external search engines through advanced text indexing, vector similarity search, and intelligent relevance scoring integrated directly within MongoDB. The combination of full-text search with semantic understanding, multi-language support, and real-time synchronization makes Atlas Search ideal for modern applications requiring sophisticated search experiences.

Key Atlas Search benefits include:

- **Native Integration**: Seamless search capabilities without external dependencies or complex data synchronization
- **Advanced Text Analysis**: Comprehensive full-text search with fuzzy matching, highlighting, and multi-language support
- **Vector Similarity**: Semantic search capabilities using machine learning embeddings for contextual understanding
- **Real-Time Synchronization**: Instant search index updates without manual refresh or batch processing
- **Faceted Search**: Advanced filtering and categorization capabilities for enhanced user search experiences
- **SQL Accessibility**: Familiar SQL-style search operations through QueryLeaf for accessible search implementation

Whether you're building content management systems, e-commerce platforms, knowledge bases, or enterprise search applications, MongoDB Atlas Search with QueryLeaf's familiar SQL interface provides the foundation for powerful, scalable search experiences.

> **QueryLeaf Integration**: QueryLeaf seamlessly manages MongoDB Atlas Search operations while providing SQL-familiar search syntax, index management, and advanced search query construction. Sophisticated search patterns including full-text search, vector similarity, faceted filtering, and search analytics are elegantly handled through familiar SQL constructs, making advanced search capabilities both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust Atlas Search capabilities with SQL-style search operations makes it an ideal platform for applications requiring both advanced search functionality and familiar database interaction patterns, ensuring your search implementations remain both sophisticated and maintainable as your search requirements evolve and scale.