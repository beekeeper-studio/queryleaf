---
title: "MongoDB Atlas Vector Search for AI Applications: Building Semantic Search and Retrieval-Augmented Generation Systems with SQL-Style Operations"
description: "Master MongoDB Atlas Vector Search for AI applications, semantic similarity, and RAG systems. Learn vector indexing, embedding storage, and SQL-familiar search patterns with QueryLeaf integration for modern AI-powered applications."
date: 2025-11-12
tags: [mongodb, atlas, vector-search, ai, machine-learning, embeddings, semantic-search, rag, sql]
---

# MongoDB Atlas Vector Search for AI Applications: Building Semantic Search and Retrieval-Augmented Generation Systems with SQL-Style Operations

Modern AI applications require sophisticated data retrieval capabilities that go beyond traditional text matching to understand semantic meaning, context, and conceptual similarity. Vector search technology enables applications to find relevant information based on meaning rather than exact keyword matches, powering everything from recommendation engines to retrieval-augmented generation (RAG) systems.

MongoDB Atlas Vector Search provides native vector database capabilities integrated directly into MongoDB's document model, enabling developers to build AI applications without managing separate vector databases. Unlike standalone vector databases that require complex data synchronization and additional infrastructure, Atlas Vector Search combines traditional document operations with vector similarity search in a single, scalable platform.

## The Traditional Vector Search Infrastructure Challenge

Building AI applications with traditional vector databases often requires complex, fragmented infrastructure:

```sql
-- Traditional PostgreSQL with pgvector extension - complex setup and limited scalability

-- Enable vector extension (requires superuser privileges)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table for document storage with vector embeddings
CREATE TABLE document_embeddings (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_url TEXT,
    document_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Vector embedding column (limited to 16,000 dimensions in pgvector)
    embedding vector(1536), -- OpenAI embedding dimension
    
    -- Metadata for filtering
    category VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en',
    author VARCHAR(200),
    tags TEXT[],
    
    -- Full-text search support
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED
);

-- Vector similarity index (limited indexing options)
CREATE INDEX embedding_idx ON document_embeddings 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 1000); -- Requires manual tuning

-- Full-text search index
CREATE INDEX document_search_idx ON document_embeddings USING GIN(search_vector);

-- Compound index for metadata filtering
CREATE INDEX document_metadata_idx ON document_embeddings(category, language, created_at);

-- Complex vector similarity search with metadata filtering
WITH vector_search AS (
  SELECT 
    document_id,
    title,
    content,
    category,
    author,
    created_at,
    
    -- Cosine similarity calculation
    1 - (embedding <=> $1::vector) as similarity_score,
    
    -- L2 distance (alternative metric)
    embedding <-> $1::vector as l2_distance,
    
    -- Inner product similarity  
    (embedding <#> $1::vector) * -1 as inner_product_similarity,
    
    -- Hybrid scoring combining vector and text search
    ts_rank(search_vector, plainto_tsquery('english', $2)) as text_relevance_score
    
  FROM document_embeddings
  WHERE 
    -- Metadata filtering (applied before vector search for performance)
    category = ANY($3::text[]) 
    AND language = $4
    AND created_at >= $5::timestamp
    
    -- Optional full-text pre-filtering
    AND (CASE WHEN $2 IS NOT NULL AND $2 != '' 
         THEN search_vector @@ plainto_tsquery('english', $2)
         ELSE true END)
),

ranked_results AS (
  SELECT *,
    -- Hybrid ranking combining multiple signals
    (0.7 * similarity_score + 0.3 * text_relevance_score) as hybrid_score,
    
    -- Relevance classification
    CASE 
      WHEN similarity_score >= 0.8 THEN 'highly_relevant'
      WHEN similarity_score >= 0.6 THEN 'relevant'  
      WHEN similarity_score >= 0.4 THEN 'somewhat_relevant'
      ELSE 'low_relevance'
    END as relevance_category,
    
    -- Diversity scoring (for result diversification)
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY similarity_score DESC) as category_rank
    
  FROM vector_search
  WHERE similarity_score >= 0.3 -- Similarity threshold
),

diversified_results AS (
  SELECT *,
    -- Result diversification logic
    CASE 
      WHEN category_rank <= 2 THEN hybrid_score -- Top 2 per category get full score
      WHEN category_rank <= 5 THEN hybrid_score * 0.8 -- Next 3 get reduced score
      ELSE hybrid_score * 0.5 -- Others get significantly reduced score
    END as diversified_score
    
  FROM ranked_results
)

SELECT 
  document_id,
  title,
  LEFT(content, 500) as content_preview, -- Truncate for performance
  category,
  author,
  created_at,
  ROUND(similarity_score::numeric, 4) as similarity,
  ROUND(text_relevance_score::numeric, 4) as text_relevance,
  ROUND(diversified_score::numeric, 4) as final_score,
  relevance_category,
  
  -- Highlight matching terms (requires additional processing)
  ts_headline('english', content, plainto_tsquery('english', $2), 
              'MaxWords=50, MinWords=20, MaxFragments=3') as highlighted_content

FROM diversified_results
ORDER BY diversified_score DESC, similarity_score DESC
LIMIT $6::int -- Result limit parameter
OFFSET $7::int; -- Pagination offset

-- Problems with traditional vector database approaches:
-- 1. Complex infrastructure requiring separate vector database setup and management
-- 2. Limited integration between vector search and traditional document operations
-- 3. Manual index tuning and maintenance for optimal vector search performance
-- 4. Difficult data synchronization between operational databases and vector stores
-- 5. Limited scalability and high operational complexity for production deployments
-- 6. Fragmented query capabilities requiring multiple systems for comprehensive search
-- 7. Complex hybrid search implementations combining vector and traditional search
-- 8. Limited support for real-time updates and dynamic vector index management
-- 9. Expensive infrastructure costs for separate specialized vector database systems
-- 10. Difficult migration paths and vendor lock-in with specialized vector database solutions

-- Pinecone example (proprietary vector database)
-- Requires separate service, API calls, and complex data synchronization
-- Limited filtering capabilities and expensive for large-scale applications
-- No native SQL interface or familiar query patterns

-- Weaviate/Chroma examples similarly require:
-- - Separate infrastructure and service management  
-- - Complex data pipeline orchestration
-- - Limited integration with existing application databases
-- - Expensive scaling and operational complexity
```

MongoDB Atlas Vector Search provides integrated vector database capabilities:

```javascript
// MongoDB Atlas Vector Search - native integration with document operations
const { MongoClient } = require('mongodb');

// Advanced Atlas Vector Search system for AI applications
class AtlasVectorSearchManager {
  constructor(connectionString, databaseName) {
    this.client = new MongoClient(connectionString);
    this.db = this.client.db(databaseName);
    this.collections = {
      documents: this.db.collection('documents'),
      embeddings: this.db.collection('embeddings'), 
      searchLogs: this.db.collection('search_logs'),
      userProfiles: this.db.collection('user_profiles')
    };
    
    this.embeddingDimensions = 1536; // OpenAI embedding size
    this.searchConfigs = new Map();
    this.performanceMetrics = new Map();
  }

  async createVectorSearchIndexes() {
    console.log('Creating optimized vector search indexes for AI applications...');
    
    try {
      // Primary vector search index for document embeddings
      await this.collections.documents.createSearchIndex({
        name: "document_vector_index",
        type: "vectorSearch",
        definition: {
          "fields": [
            {
              "type": "vector",
              "path": "embedding",
              "numDimensions": this.embeddingDimensions,
              "similarity": "cosine"
            },
            {
              "type": "filter", 
              "path": "metadata.category"
            },
            {
              "type": "filter",
              "path": "metadata.language" 
            },
            {
              "type": "filter",
              "path": "metadata.source"
            },
            {
              "type": "filter",
              "path": "created_at"
            },
            {
              "type": "filter",
              "path": "metadata.tags"
            }
          ]
        }
      });

      // Hybrid search index combining full-text and vector search
      await this.collections.documents.createSearchIndex({
        name: "hybrid_search_index",
        type: "search",
        definition: {
          "mappings": {
            "dynamic": false,
            "fields": {
              "title": {
                "type": "text",
                "analyzer": "lucene.standard"
              },
              "content": {
                "type": "text", 
                "analyzer": "lucene.english"
              },
              "metadata": {
                "type": "document",
                "fields": {
                  "category": {
                    "type": "string"
                  },
                  "tags": {
                    "type": "stringFacet"
                  },
                  "language": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      });

      // User preference vector index for personalized search
      await this.collections.userProfiles.createSearchIndex({
        name: "user_preference_vector_index",
        type: "vectorSearch", 
        definition: {
          "fields": [
            {
              "type": "vector",
              "path": "preference_embedding",
              "numDimensions": this.embeddingDimensions,
              "similarity": "cosine"
            },
            {
              "type": "filter",
              "path": "user_id"
            },
            {
              "type": "filter", 
              "path": "profile_type"
            }
          ]
        }
      });

      console.log('Vector search indexes created successfully');
      return { success: true, indexes: ['document_vector_index', 'hybrid_search_index', 'user_preference_vector_index'] };

    } catch (error) {
      console.error('Error creating vector search indexes:', error);
      return { success: false, error: error.message };
    }
  }

  async ingestDocumentsWithEmbeddings(documents, embeddingFunction) {
    console.log(`Ingesting ${documents.length} documents with vector embeddings...`);
    
    const batchSize = 100;
    const batches = [];
    let totalIngested = 0;
    
    // Process documents in batches for optimal performance
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      batches.push(batch);
    }

    for (const [batchIndex, batch] of batches.entries()) {
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}`);
      
      try {
        // Generate embeddings for batch
        const batchTexts = batch.map(doc => `${doc.title}\n\n${doc.content}`);
        const embeddings = await embeddingFunction(batchTexts);
        
        // Prepare documents with embeddings and metadata
        const enrichedDocuments = batch.map((doc, index) => ({
          _id: doc._id || new ObjectId(),
          title: doc.title,
          content: doc.content,
          
          // Vector embedding
          embedding: embeddings[index],
          
          // Rich metadata for filtering and analytics
          metadata: {
            category: doc.category || 'general',
            subcategory: doc.subcategory,
            language: doc.language || 'en',
            source: doc.source || 'unknown',
            source_url: doc.source_url,
            author: doc.author,
            tags: doc.tags || [],
            
            // Content analysis metadata
            word_count: this.calculateWordCount(doc.content),
            reading_time_minutes: Math.ceil(this.calculateWordCount(doc.content) / 200),
            content_type: this.inferContentType(doc),
            sentiment_score: doc.sentiment_score,
            
            // Technical metadata
            extraction_method: doc.extraction_method || 'manual',
            processing_version: '1.0',
            quality_score: this.calculateQualityScore(doc)
          },
          
          // Timestamps
          created_at: doc.created_at || new Date(),
          updated_at: new Date(),
          indexed_at: new Date(),
          
          // Search optimization fields
          searchable_text: `${doc.title} ${doc.content} ${(doc.tags || []).join(' ')}`,
          
          // Embedding metadata
          embedding_model: 'text-embedding-ada-002',
          embedding_dimensions: this.embeddingDimensions,
          embedding_created_at: new Date()
        }));

        // Bulk insert with error handling
        const result = await this.collections.documents.insertMany(enrichedDocuments, {
          ordered: false,
          writeConcern: { w: 'majority' }
        });

        totalIngested += result.insertedCount;
        console.log(`Batch ${batchIndex + 1} completed: ${result.insertedCount} documents ingested`);

      } catch (error) {
        console.error(`Error processing batch ${batchIndex + 1}:`, error);
        continue; // Continue with next batch
      }
    }

    console.log(`Document ingestion completed: ${totalIngested}/${documents.length} documents successfully ingested`);
    return {
      success: true,
      totalIngested,
      totalDocuments: documents.length,
      successRate: (totalIngested / documents.length * 100).toFixed(2)
    };
  }

  async performSemanticSearch(queryEmbedding, options = {}) {
    console.log('Performing semantic vector search...');
    
    const {
      limit = 10,
      categories = [],
      language = null,
      source = null,
      tags = [],
      dateRange = null,
      similarityThreshold = 0.7,
      includeMetadata = true,
      boostFactors = {},
      userProfile = null
    } = options;

    // Build filter criteria
    const filterCriteria = [];
    
    if (categories.length > 0) {
      filterCriteria.push({
        "metadata.category": { $in: categories }
      });
    }
    
    if (language) {
      filterCriteria.push({
        "metadata.language": { $eq: language }
      });
    }
    
    if (source) {
      filterCriteria.push({
        "metadata.source": { $eq: source }
      });
    }
    
    if (tags.length > 0) {
      filterCriteria.push({
        "metadata.tags": { $in: tags }
      });
    }
    
    if (dateRange) {
      filterCriteria.push({
        "created_at": {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      });
    }

    try {
      // Build aggregation pipeline for vector search
      const pipeline = [
        {
          $vectorSearch: {
            index: "document_vector_index",
            path: "embedding",
            queryVector: queryEmbedding,
            numCandidates: limit * 10, // Search more candidates for better results
            limit: limit * 2, // Get extra results for post-processing
            ...(filterCriteria.length > 0 && {
              filter: {
                $and: filterCriteria
              }
            })
          }
        },
        
        // Add similarity score
        {
          $addFields: {
            similarity_score: { $meta: "vectorSearchScore" }
          }
        },
        
        // Filter by similarity threshold
        {
          $match: {
            similarity_score: { $gte: similarityThreshold }
          }
        },
        
        // Add computed fields for ranking
        {
          $addFields: {
            // Content quality boost
            quality_boost: {
              $multiply: [
                "$metadata.quality_score",
                boostFactors.quality || 1.0
              ]
            },
            
            // Recency boost
            recency_boost: {
              $multiply: [
                {
                  $divide: [
                    { $subtract: [new Date(), "$created_at"] },
                    86400000 * 365 // Days in milliseconds
                  ]
                },
                boostFactors.recency || 0.1
              ]
            },
            
            // Source authority boost
            source_boost: {
              $switch: {
                branches: [
                  { case: { $eq: ["$metadata.source", "official"] }, then: boostFactors.official || 1.2 },
                  { case: { $eq: ["$metadata.source", "expert"] }, then: boostFactors.expert || 1.1 }
                ],
                default: 1.0
              }
            }
          }
        },
        
        // Calculate final ranking score
        {
          $addFields: {
            final_score: {
              $multiply: [
                "$similarity_score",
                {
                  $add: [
                    1.0,
                    "$quality_boost",
                    "$recency_boost", 
                    "$source_boost"
                  ]
                }
              ]
            },
            
            // Relevance classification
            relevance_category: {
              $switch: {
                branches: [
                  { case: { $gte: ["$similarity_score", 0.9] }, then: "highly_relevant" },
                  { case: { $gte: ["$similarity_score", 0.8] }, then: "relevant" },
                  { case: { $gte: ["$similarity_score", 0.7] }, then: "somewhat_relevant" }
                ],
                default: "marginally_relevant"
              }
            }
          }
        },
        
        // Add personalization if user profile provided
        ...(userProfile ? [{
          $lookup: {
            from: "user_profiles",
            let: { doc_category: "$metadata.category", doc_tags: "$metadata.tags" },
            pipeline: [
              {
                $match: {
                  user_id: userProfile.user_id,
                  $expr: {
                    $or: [
                      { $in: ["$$doc_category", "$preferred_categories"] },
                      { $gt: [{ $size: { $setIntersection: ["$$doc_tags", "$preferred_tags"] } }, 0] }
                    ]
                  }
                }
              }
            ],
            as: "user_preference_match"
          }
        }, {
          $addFields: {
            personalization_boost: {
              $cond: {
                if: { $gt: [{ $size: "$user_preference_match" }, 0] },
                then: boostFactors.personalization || 1.15,
                else: 1.0
              }
            },
            final_score: {
              $multiply: ["$final_score", "$personalization_boost"]
            }
          }
        }] : []),
        
        // Sort by final score
        {
          $sort: { final_score: -1, similarity_score: -1 }
        },
        
        // Limit results
        {
          $limit: limit
        },
        
        // Project final fields
        {
          $project: {
            _id: 1,
            title: 1,
            content: 1,
            ...(includeMetadata && { metadata: 1 }),
            similarity_score: { $round: ["$similarity_score", 4] },
            final_score: { $round: ["$final_score", 4] },
            relevance_category: 1,
            created_at: 1,
            
            // Generate content snippet
            content_snippet: {
              $substr: ["$content", 0, 300]
            },
            
            // Search result metadata
            search_metadata: {
              embedding_model: "$embedding_model",
              indexed_at: "$indexed_at",
              quality_score: "$metadata.quality_score"
            }
          }
        }
      ];

      const startTime = Date.now();
      const results = await this.collections.documents.aggregate(pipeline).toArray();
      const searchTime = Date.now() - startTime;

      // Log search performance
      this.recordSearchMetrics({
        query_type: 'semantic_vector_search',
        results_count: results.length,
        search_time_ms: searchTime,
        similarity_threshold: similarityThreshold,
        filters_applied: filterCriteria.length,
        timestamp: new Date()
      });

      console.log(`Semantic search completed: ${results.length} results in ${searchTime}ms`);
      
      return {
        success: true,
        results: results,
        search_metadata: {
          query_type: 'semantic',
          results_count: results.length,
          search_time_ms: searchTime,
          similarity_threshold: similarityThreshold,
          filters_applied: filterCriteria.length,
          personalized: !!userProfile
        }
      };

    } catch (error) {
      console.error('Semantic search error:', error);
      return {
        success: false,
        error: error.message,
        results: []
      };
    }
  }

  async performHybridSearch(query, queryEmbedding, options = {}) {
    console.log('Performing hybrid search combining text and vector similarity...');
    
    const {
      limit = 10,
      textWeight = 0.3,
      vectorWeight = 0.7,
      categories = [],
      language = 'en'
    } = options;

    try {
      // Execute vector search
      const vectorResults = await this.performSemanticSearch(queryEmbedding, {
        ...options,
        limit: limit * 2 // Get more results for hybrid ranking
      });

      // Execute text search using Atlas Search
      const textSearchPipeline = [
        {
          $search: {
            index: "hybrid_search_index",
            compound: {
              must: [
                {
                  text: {
                    query: query,
                    path: ["title", "content"],
                    fuzzy: {
                      maxEdits: 2,
                      prefixLength: 3
                    }
                  }
                }
              ],
              ...(categories.length > 0 && {
                filter: [
                  {
                    text: {
                      query: categories,
                      path: "metadata.category"
                    }
                  }
                ]
              })
            },
            highlight: {
              path: "content",
              maxCharsToExamine: 1000,
              maxNumPassages: 3
            }
          }
        },
        {
          $addFields: {
            text_score: { $meta: "searchScore" },
            highlights: { $meta: "searchHighlights" }
          }
        },
        {
          $limit: limit * 2
        }
      ];

      const textResults = await this.collections.documents.aggregate(textSearchPipeline).toArray();

      // Combine and rank results using hybrid scoring
      const combinedResults = this.combineHybridResults(
        vectorResults.results || [], 
        textResults,
        textWeight,
        vectorWeight
      );

      // Sort by hybrid score and limit
      combinedResults.sort((a, b) => b.hybrid_score - a.hybrid_score);
      const finalResults = combinedResults.slice(0, limit);

      return {
        success: true,
        results: finalResults,
        search_metadata: {
          query_type: 'hybrid',
          text_results_count: textResults.length,
          vector_results_count: vectorResults.results?.length || 0,
          combined_results_count: combinedResults.length,
          final_results_count: finalResults.length,
          text_weight: textWeight,
          vector_weight: vectorWeight
        }
      };

    } catch (error) {
      console.error('Hybrid search error:', error);
      return {
        success: false,
        error: error.message,
        results: []
      };
    }
  }

  combineHybridResults(vectorResults, textResults, textWeight, vectorWeight) {
    const resultMap = new Map();
    
    // Normalize scores to 0-1 range
    const maxVectorScore = Math.max(...vectorResults.map(r => r.similarity_score || 0));
    const maxTextScore = Math.max(...textResults.map(r => r.text_score || 0));

    // Process vector results
    vectorResults.forEach(result => {
      const normalizedVectorScore = maxVectorScore > 0 ? result.similarity_score / maxVectorScore : 0;
      resultMap.set(result._id.toString(), {
        ...result,
        normalized_vector_score: normalizedVectorScore,
        normalized_text_score: 0,
        hybrid_score: normalizedVectorScore * vectorWeight
      });
    });

    // Process text results and combine
    textResults.forEach(result => {
      const normalizedTextScore = maxTextScore > 0 ? result.text_score / maxTextScore : 0;
      const docId = result._id.toString();
      
      if (resultMap.has(docId)) {
        // Document found in both searches - combine scores
        const existing = resultMap.get(docId);
        existing.normalized_text_score = normalizedTextScore;
        existing.hybrid_score = (existing.normalized_vector_score * vectorWeight) + 
                               (normalizedTextScore * textWeight);
        existing.highlights = result.highlights;
        existing.search_type = 'both';
      } else {
        // Document only found in text search
        resultMap.set(docId, {
          ...result,
          normalized_vector_score: 0,
          normalized_text_score: normalizedTextScore,
          hybrid_score: normalizedTextScore * textWeight,
          search_type: 'text_only',
          similarity_score: 0,
          relevance_category: 'text_match'
        });
      }
    });

    return Array.from(resultMap.values());
  }

  async buildRAGPipeline(query, options = {}) {
    console.log('Building Retrieval-Augmented Generation pipeline...');
    
    const {
      contextLimit = 5,
      maxContextLength = 4000,
      embeddingFunction,
      llmFunction,
      temperature = 0.7,
      includeSourceCitations = true
    } = options;

    try {
      // Step 1: Generate query embedding
      const queryEmbedding = await embeddingFunction([query]);
      
      // Step 2: Retrieve relevant context using semantic search
      const searchResults = await this.performSemanticSearch(queryEmbedding[0], {
        limit: contextLimit * 2, // Get extra results for context selection
        similarityThreshold: 0.6
      });

      if (!searchResults.success || searchResults.results.length === 0) {
        return {
          success: false,
          error: 'No relevant context found',
          query: query
        };
      }

      // Step 3: Select and rank context documents
      const contextDocuments = this.selectOptimalContext(
        searchResults.results,
        maxContextLength
      );

      // Step 4: Build context string with source tracking
      const contextString = contextDocuments.map((doc, index) => {
        const sourceId = `[${index + 1}]`;
        return `${sourceId} ${doc.title}\n${doc.content_snippet || doc.content.substring(0, 500)}...`;
      }).join('\n\n');

      // Step 5: Create RAG prompt
      const ragPrompt = this.buildRAGPrompt(query, contextString, includeSourceCitations);

      // Step 6: Generate response using LLM
      const llmResponse = await llmFunction(ragPrompt, {
        temperature,
        max_tokens: 1000,
        stop: ["[END]"]
      });

      // Step 7: Extract citations and build response
      const response = {
        success: true,
        query: query,
        answer: llmResponse.text || llmResponse,
        context_used: contextDocuments.length,
        sources: contextDocuments.map((doc, index) => ({
          id: index + 1,
          title: doc.title,
          similarity_score: doc.similarity_score,
          source: doc.metadata?.source,
          url: doc.metadata?.source_url
        })),
        search_metadata: searchResults.search_metadata,
        generation_metadata: {
          model: llmResponse.model || 'unknown',
          temperature: temperature,
          context_length: contextString.length,
          response_tokens: llmResponse.usage?.total_tokens || 0
        }
      };

      // Log RAG pipeline usage
      await this.logRAGUsage({
        query: query,
        context_documents: contextDocuments.length,
        response_length: response.answer.length,
        sources_cited: response.sources.length,
        timestamp: new Date()
      });

      return response;

    } catch (error) {
      console.error('RAG pipeline error:', error);
      return {
        success: false,
        error: error.message,
        query: query
      };
    }
  }

  selectOptimalContext(searchResults, maxLength) {
    let totalLength = 0;
    const selectedDocs = [];
    
    // Sort by relevance and diversity
    const rankedResults = searchResults.sort((a, b) => {
      // Primary sort by similarity score
      if (b.similarity_score !== a.similarity_score) {
        return b.similarity_score - a.similarity_score;
      }
      // Secondary sort by content quality
      return (b.metadata?.quality_score || 0) - (a.metadata?.quality_score || 0);
    });

    for (const doc of rankedResults) {
      const docLength = (doc.content_snippet || doc.content || '').length;
      
      if (totalLength + docLength <= maxLength) {
        selectedDocs.push(doc);
        totalLength += docLength;
      }
      
      if (selectedDocs.length >= 5) break; // Limit to top 5 documents
    }

    return selectedDocs;
  }

  buildRAGPrompt(query, context, includeCitations) {
    return `You are a helpful assistant that answers questions based on the provided context. Use the context information to provide accurate and comprehensive answers.

Context Information:
${context}

Question: ${query}

Instructions:
- Answer based solely on the information provided in the context
- If the context doesn't contain enough information to answer fully, state what information is missing
- Be comprehensive but concise
${includeCitations ? '- Include source citations using the [number] format from the context' : ''}
- If no relevant information is found, clearly state that the context doesn't contain the answer

Answer:`;
  }

  recordSearchMetrics(metrics) {
    const key = `${metrics.query_type}_${Date.now()}`;
    this.performanceMetrics.set(key, metrics);
    
    // Keep only last 1000 metrics
    if (this.performanceMetrics.size > 1000) {
      const oldestKey = this.performanceMetrics.keys().next().value;
      this.performanceMetrics.delete(oldestKey);
    }
  }

  async logRAGUsage(usage) {
    try {
      await this.collections.searchLogs.insertOne({
        ...usage,
        type: 'rag_pipeline'
      });
    } catch (error) {
      console.warn('Failed to log RAG usage:', error);
    }
  }

  calculateWordCount(text) {
    return (text || '').split(/\s+/).filter(word => word.length > 0).length;
  }

  inferContentType(doc) {
    if (doc.content && doc.content.includes('```')) return 'technical';
    if (doc.title && doc.title.includes('Tutorial')) return 'tutorial';
    if (doc.content && doc.content.length > 2000) return 'long_form';
    return 'standard';
  }

  calculateQualityScore(doc) {
    let score = 0.5; // Base score
    
    if (doc.title && doc.title.length > 10) score += 0.1;
    if (doc.content && doc.content.length > 500) score += 0.2;
    if (doc.author) score += 0.1;
    if (doc.tags && doc.tags.length > 0) score += 0.1;
    
    return Math.min(1.0, score);
  }
}

// Benefits of MongoDB Atlas Vector Search:
// - Native integration with MongoDB document model and operations
// - Automatic scaling and management without separate vector database infrastructure  
// - Advanced filtering capabilities combined with vector similarity search
// - Hybrid search combining full-text and vector search capabilities
// - Built-in indexing optimization for high-performance vector operations
// - Integrated analytics and monitoring for vector search performance
// - Real-time updates and dynamic index management
// - Cost-effective scaling with MongoDB Atlas infrastructure
// - Comprehensive security and compliance features
// - SQL-compatible vector operations through QueryLeaf integration

module.exports = {
  AtlasVectorSearchManager
};
```

## Understanding MongoDB Atlas Vector Search Architecture

### Advanced Vector Search Patterns for AI Applications

Implement sophisticated vector search patterns for production AI applications:

```javascript
// Advanced vector search patterns and AI application integration
class ProductionVectorSearchSystem {
  constructor(atlasConfig) {
    this.atlasManager = new AtlasVectorSearchManager(
      atlasConfig.connectionString, 
      atlasConfig.database
    );
    this.embeddingCache = new Map();
    this.searchCache = new Map();
    this.analyticsCollector = new Map();
  }

  async buildIntelligentDocumentProcessor(documents, processingOptions = {}) {
    console.log('Building intelligent document processing pipeline...');
    
    const {
      chunkSize = 1000,
      chunkOverlap = 200,
      embeddingModel = 'text-embedding-ada-002',
      enableSemanticChunking = true,
      extractKeywords = true,
      analyzeSentiment = true
    } = processingOptions;

    const processedDocuments = [];
    
    for (const doc of documents) {
      try {
        // Step 1: Intelligent document chunking
        const chunks = enableSemanticChunking ? 
          await this.performSemanticChunking(doc.content, chunkSize, chunkOverlap) :
          this.performFixedChunking(doc.content, chunkSize, chunkOverlap);

        // Step 2: Process each chunk
        for (const [chunkIndex, chunk] of chunks.entries()) {
          const chunkDoc = {
            _id: new ObjectId(),
            parent_document_id: doc._id,
            title: `${doc.title} - Part ${chunkIndex + 1}`,
            content: chunk.text,
            chunk_index: chunkIndex,
            
            // Chunk metadata
            chunk_metadata: {
              word_count: chunk.word_count,
              sentence_count: chunk.sentence_count,
              start_position: chunk.start_position,
              end_position: chunk.end_position,
              semantic_density: chunk.semantic_density || 0
            },
            
            // Enhanced metadata processing
            metadata: {
              ...doc.metadata,
              // Keyword extraction
              ...(extractKeywords && {
                keywords: await this.extractKeywords(chunk.text),
                entities: await this.extractEntities(chunk.text)
              }),
              
              // Sentiment analysis  
              ...(analyzeSentiment && {
                sentiment: await this.analyzeSentiment(chunk.text)
              }),
              
              // Document structure analysis
              structure_type: this.analyzeDocumentStructure(chunk.text),
              information_density: this.calculateInformationDensity(chunk.text)
            },
            
            created_at: doc.created_at,
            updated_at: new Date(),
            processing_version: '2.0'
          };

          processedDocuments.push(chunkDoc);
        }

      } catch (error) {
        console.error(`Error processing document ${doc._id}:`, error);
        continue;
      }
    }

    console.log(`Document processing completed: ${processedDocuments.length} chunks created from ${documents.length} documents`);
    return processedDocuments;
  }

  async performSemanticChunking(text, targetSize, overlap) {
    // Implement semantic-aware chunking that preserves meaning
    const sentences = this.splitIntoSentences(text);
    const chunks = [];
    let currentChunk = '';
    let currentWordCount = 0;
    let startPosition = 0;

    for (const sentence of sentences) {
      const sentenceWordCount = sentence.split(/\s+/).length;
      
      if (currentWordCount + sentenceWordCount > targetSize && currentChunk.length > 0) {
        // Create chunk with semantic coherence
        chunks.push({
          text: currentChunk.trim(),
          word_count: currentWordCount,
          sentence_count: currentChunk.split(/[.!?]+/).length - 1,
          start_position: startPosition,
          end_position: startPosition + currentChunk.length,
          semantic_density: await this.calculateSemanticDensity(currentChunk)
        });

        // Start new chunk with overlap
        const overlapText = this.extractOverlapText(currentChunk, overlap);
        currentChunk = overlapText + ' ' + sentence;
        currentWordCount = this.countWords(currentChunk);
        startPosition += currentChunk.length - overlapText.length;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentWordCount += sentenceWordCount;
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        word_count: currentWordCount,
        sentence_count: currentChunk.split(/[.!?]+/).length - 1,
        start_position: startPosition,
        end_position: startPosition + currentChunk.length,
        semantic_density: await this.calculateSemanticDensity(currentChunk)
      });
    }

    return chunks;
  }

  async buildConversationalRAG(conversationHistory, currentQuery, options = {}) {
    console.log('Building conversational RAG system...');
    
    const {
      contextWindow = 5,
      includeConversationContext = true,
      personalizeResponse = true,
      userId = null
    } = options;

    try {
      // Step 1: Build conversational context
      let enhancedQuery = currentQuery;
      
      if (includeConversationContext && conversationHistory.length > 0) {
        const recentContext = conversationHistory.slice(-contextWindow);
        const contextSummary = recentContext.map(turn => 
          `${turn.role}: ${turn.content}`
        ).join('\n');
        
        enhancedQuery = `Previous conversation context:\n${contextSummary}\n\nCurrent question: ${currentQuery}`;
      }

      // Step 2: Generate enhanced query embedding
      const queryEmbedding = await this.generateEmbedding(enhancedQuery);

      // Step 3: Personalized retrieval if user profile available
      let userProfile = null;
      if (personalizeResponse && userId) {
        userProfile = await this.getUserProfile(userId);
      }

      // Step 4: Perform contextual search
      const searchResults = await this.atlasManager.performSemanticSearch(queryEmbedding, {
        limit: 8,
        userProfile: userProfile,
        boostFactors: {
          recency: 0.2,
          quality: 0.3,
          personalization: 0.2
        }
      });

      // Step 5: Build conversational RAG response
      const ragResponse = await this.atlasManager.buildRAGPipeline(enhancedQuery, {
        contextLimit: 6,
        maxContextLength: 5000,
        embeddingFunction: (texts) => Promise.resolve([queryEmbedding]),
        llmFunction: this.createConversationalLLMFunction(conversationHistory),
        includeSourceCitations: true
      });

      // Step 6: Post-process for conversation continuity
      if (ragResponse.success) {
        ragResponse.conversation_metadata = {
          context_turns_used: Math.min(contextWindow, conversationHistory.length),
          personalized: !!userProfile,
          query_enhanced: includeConversationContext,
          user_id: userId
        };
      }

      return ragResponse;

    } catch (error) {
      console.error('Conversational RAG error:', error);
      return {
        success: false,
        error: error.message,
        query: currentQuery
      };
    }
  }

  createConversationalLLMFunction(conversationHistory) {
    return async (prompt, options = {}) => {
      // Add conversation-aware instructions
      const conversationalPrompt = `You are a helpful assistant engaged in an ongoing conversation. 
      
Previous conversation context has been provided. Use this context to:
- Maintain conversation continuity
- Reference previous topics when relevant
- Provide contextually appropriate responses
- Acknowledge when building on previous answers

${prompt}

Remember to be conversational and reference the ongoing dialogue when appropriate.`;

      // This would integrate with your preferred LLM service
      return await this.callLLMService(conversationalPrompt, options);
    };
  }

  async implementRecommendationSystem(userId, options = {}) {
    console.log(`Building recommendation system for user ${userId}...`);
    
    const {
      recommendationType = 'content',
      diversityFactor = 0.3,
      noveltyBoost = 0.2,
      limit = 10
    } = options;

    try {
      // Step 1: Get user profile and interaction history
      const userProfile = await this.getUserProfile(userId);
      const interactionHistory = await this.getUserInteractions(userId);

      // Step 2: Build user preference embedding
      const userPreferenceEmbedding = await this.buildUserPreferenceEmbedding(
        userProfile, 
        interactionHistory
      );

      // Step 3: Find similar content
      const candidateResults = await this.atlasManager.performSemanticSearch(
        userPreferenceEmbedding,
        {
          limit: limit * 3, // Get more candidates for diversity
          similarityThreshold: 0.4
        }
      );

      // Step 4: Apply diversity and novelty filtering
      const diversifiedResults = this.applyDiversityFiltering(
        candidateResults.results,
        interactionHistory,
        diversityFactor,
        noveltyBoost
      );

      // Step 5: Rank final recommendations
      const finalRecommendations = diversifiedResults.slice(0, limit).map((rec, index) => ({
        ...rec,
        recommendation_rank: index + 1,
        recommendation_score: rec.final_score,
        recommendation_reasons: this.generateRecommendationReasons(rec, userProfile)
      }));

      return {
        success: true,
        user_id: userId,
        recommendations: finalRecommendations,
        recommendation_metadata: {
          algorithm: 'vector_similarity_with_diversity',
          diversity_factor: diversityFactor,
          novelty_boost: noveltyBoost,
          candidates_evaluated: candidateResults.results?.length || 0,
          final_count: finalRecommendations.length
        }
      };

    } catch (error) {
      console.error('Recommendation system error:', error);
      return {
        success: false,
        error: error.message,
        user_id: userId
      };
    }
  }

  applyDiversityFiltering(candidates, userHistory, diversityFactor, noveltyBoost) {
    // Track categories and topics to ensure diversity
    const categoryCount = new Map();
    const diversifiedResults = [];
    
    // Get user's previously interacted content for novelty scoring
    const previouslyViewed = new Set(
      userHistory.map(interaction => interaction.document_id?.toString())
    );

    for (const candidate of candidates) {
      const category = candidate.metadata?.category || 'unknown';
      const currentCategoryCount = categoryCount.get(category) || 0;
      
      // Calculate diversity penalty (more items in category = higher penalty)
      const diversityPenalty = currentCategoryCount * diversityFactor;
      
      // Calculate novelty boost (unseen content gets boost)
      const noveltyScore = previouslyViewed.has(candidate._id.toString()) ? 0 : noveltyBoost;
      
      // Apply adjustments to final score
      candidate.final_score = (candidate.final_score || candidate.similarity_score) - diversityPenalty + noveltyScore;
      candidate.diversity_penalty = diversityPenalty;
      candidate.novelty_boost = noveltyScore;
      
      diversifiedResults.push(candidate);
      categoryCount.set(category, currentCategoryCount + 1);
    }

    return diversifiedResults.sort((a, b) => b.final_score - a.final_score);
  }

  generateRecommendationReasons(recommendation, userProfile) {
    const reasons = [];
    
    if (userProfile.preferred_categories?.includes(recommendation.metadata?.category)) {
      reasons.push(`Matches your interest in ${recommendation.metadata.category}`);
    }
    
    if (recommendation.similarity_score > 0.8) {
      reasons.push('Highly relevant to your preferences');
    }
    
    if (recommendation.novelty_boost > 0) {
      reasons.push('New content you haven\'t seen');
    }
    
    if (recommendation.metadata?.quality_score > 0.8) {
      reasons.push('High-quality content');
    }

    return reasons.length > 0 ? reasons : ['Recommended based on your profile'];
  }

  // Utility methods
  splitIntoSentences(text) {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }

  extractOverlapText(text, overlapSize) {
    const words = text.split(/\s+/);
    return words.slice(-overlapSize).join(' ');
  }

  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  async calculateSemanticDensity(text) {
    // Simplified semantic density calculation
    const sentences = this.splitIntoSentences(text);
    const avgSentenceLength = text.length / sentences.length;
    const wordCount = this.countWords(text);
    
    // Higher density = more information per word
    return Math.min(1.0, (avgSentenceLength / 100) * (wordCount / 500));
  }

  analyzeDocumentStructure(text) {
    if (text.includes('```') || text.includes('function') || text.includes('class')) return 'code';
    if (text.match(/^\d+\./m) || text.includes('Step')) return 'procedural';
    if (text.includes('?') && text.split('?').length > 2) return 'faq';
    return 'narrative';
  }

  calculateInformationDensity(text) {
    const uniqueWords = new Set(text.toLowerCase().match(/\b\w+\b/g) || []);
    const totalWords = this.countWords(text);
    return totalWords > 0 ? uniqueWords.size / totalWords : 0;
  }
}
```

## SQL-Style Vector Search Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Atlas Vector Search operations:

```sql
-- QueryLeaf vector search operations with SQL-familiar syntax

-- Create vector search enabled collection
CREATE COLLECTION documents_with_vectors (
  _id OBJECTID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  
  -- Vector embedding field
  embedding VECTOR(1536) NOT NULL, -- OpenAI embedding dimensions
  
  -- Metadata for filtering
  category VARCHAR(100),
  language VARCHAR(10) DEFAULT 'en',
  source VARCHAR(100),
  tags VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Document analysis fields
  word_count INTEGER,
  reading_time_minutes INTEGER,
  quality_score DECIMAL(3,2) DEFAULT 0.5,
  
  -- Full-text search support
  searchable_text TEXT GENERATED ALWAYS AS (title || ' ' || content) STORED
);

-- Create Atlas Vector Search index
CREATE VECTOR INDEX document_semantic_search ON documents_with_vectors (
  embedding USING cosine_similarity
  WITH FILTER FIELDS (category, language, source, created_at, tags)
);

-- Create hybrid search index for text + vector
CREATE SEARCH INDEX document_hybrid_search ON documents_with_vectors (
  title WITH lucene_analyzer('standard'),
  content WITH lucene_analyzer('english'),
  category WITH string_facet(),
  tags WITH string_facet()
);

-- Semantic vector search with SQL syntax
SELECT 
  _id,
  title,
  LEFT(content, 300) as content_preview,
  category,
  source,
  created_at,
  
  -- Vector similarity score
  VECTOR_SIMILARITY(embedding, $1::VECTOR(1536), 'cosine') as similarity_score,
  
  -- Relevance classification
  CASE 
    WHEN VECTOR_SIMILARITY(embedding, $1, 'cosine') >= 0.9 THEN 'highly_relevant'
    WHEN VECTOR_SIMILARITY(embedding, $1, 'cosine') >= 0.8 THEN 'relevant'
    WHEN VECTOR_SIMILARITY(embedding, $1, 'cosine') >= 0.7 THEN 'somewhat_relevant'
    ELSE 'marginally_relevant'
  END as relevance_category,
  
  -- Quality-adjusted ranking score
  VECTOR_SIMILARITY(embedding, $1, 'cosine') * (1 + quality_score * 0.2) as final_score

FROM documents_with_vectors
WHERE 
  -- Vector similarity threshold
  VECTOR_SIMILARITY(embedding, $1, 'cosine') >= $2::DECIMAL -- similarity threshold parameter
  
  -- Optional metadata filtering
  AND ($3::VARCHAR[] IS NULL OR category = ANY($3)) -- categories filter
  AND ($4::VARCHAR IS NULL OR language = $4) -- language filter  
  AND ($5::VARCHAR IS NULL OR source = $5) -- source filter
  AND ($6::VARCHAR[] IS NULL OR tags && $6) -- tags overlap filter
  AND ($7::TIMESTAMP IS NULL OR created_at >= $7) -- date filter

ORDER BY final_score DESC, similarity_score DESC
LIMIT $8::INTEGER; -- result limit

-- Advanced hybrid search combining vector and text similarity
WITH vector_search AS (
  SELECT 
    _id, title, content, category, source, created_at,
    VECTOR_SIMILARITY(embedding, $1::VECTOR(1536), 'cosine') as vector_score
  FROM documents_with_vectors
  WHERE VECTOR_SIMILARITY(embedding, $1, 'cosine') >= 0.6
  ORDER BY vector_score DESC
  LIMIT 20
),

text_search AS (
  SELECT 
    _id, title, content, category, source, created_at,
    SEARCH_SCORE() as text_score,
    SEARCH_HIGHLIGHTS('content', 3) as highlighted_content
  FROM documents_with_vectors
  WHERE MATCH(searchable_text, $2::TEXT) -- text query parameter
    WITH search_options(
      fuzzy_max_edits = 2,
      fuzzy_prefix_length = 3,
      highlight_max_chars = 1000
    )
  ORDER BY text_score DESC
  LIMIT 20
),

hybrid_results AS (
  SELECT 
    COALESCE(vs._id, ts._id) as _id,
    COALESCE(vs.title, ts.title) as title,
    COALESCE(vs.content, ts.content) as content,
    COALESCE(vs.category, ts.category) as category,
    COALESCE(vs.source, ts.source) as source,
    COALESCE(vs.created_at, ts.created_at) as created_at,
    
    -- Normalize scores to 0-1 range
    COALESCE(vs.vector_score, 0) / (SELECT MAX(vector_score) FROM vector_search) as normalized_vector_score,
    COALESCE(ts.text_score, 0) / (SELECT MAX(text_score) FROM text_search) as normalized_text_score,
    
    -- Hybrid scoring with configurable weights
    ($3::DECIMAL * COALESCE(vs.vector_score, 0) / (SELECT MAX(vector_score) FROM vector_search)) + 
    ($4::DECIMAL * COALESCE(ts.text_score, 0) / (SELECT MAX(text_score) FROM text_search)) as hybrid_score,
    
    ts.highlighted_content,
    
    -- Search type classification
    CASE 
      WHEN vs._id IS NOT NULL AND ts._id IS NOT NULL THEN 'both'
      WHEN vs._id IS NOT NULL THEN 'vector_only'
      ELSE 'text_only'
    END as search_type
    
  FROM vector_search vs
  FULL OUTER JOIN text_search ts ON vs._id = ts._id
)

SELECT 
  _id,
  title,
  LEFT(content, 400) as content_preview,
  category,
  source,
  created_at,
  
  -- Scores
  ROUND(normalized_vector_score::NUMERIC, 4) as vector_similarity,
  ROUND(normalized_text_score::NUMERIC, 4) as text_relevance, 
  ROUND(hybrid_score::NUMERIC, 4) as final_score,
  
  search_type,
  highlighted_content,
  
  -- Content insights
  CASE 
    WHEN hybrid_score >= 0.8 THEN 'excellent_match'
    WHEN hybrid_score >= 0.6 THEN 'good_match' 
    WHEN hybrid_score >= 0.4 THEN 'fair_match'
    ELSE 'weak_match'
  END as match_quality

FROM hybrid_results
ORDER BY hybrid_score DESC, normalized_vector_score DESC
LIMIT $5::INTEGER; -- final result limit

-- Retrieval-Augmented Generation (RAG) pipeline with QueryLeaf
WITH context_retrieval AS (
  SELECT 
    _id,
    title,
    content,
    category,
    VECTOR_SIMILARITY(embedding, $1::VECTOR(1536), 'cosine') as relevance_score
  FROM documents_with_vectors
  WHERE VECTOR_SIMILARITY(embedding, $1, 'cosine') >= 0.7
  ORDER BY relevance_score DESC
  LIMIT 5
),

context_preparation AS (
  SELECT 
    STRING_AGG(
      '[' || ROW_NUMBER() OVER (ORDER BY relevance_score DESC) || '] ' || 
      title || E'\n' || LEFT(content, 500) || '...',
      E'\n\n'
      ORDER BY relevance_score DESC
    ) as context_string,
    
    COUNT(*) as context_documents,
    AVG(relevance_score) as avg_relevance,
    
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'id', ROW_NUMBER() OVER (ORDER BY relevance_score DESC),
        'title', title,
        'category', category,
        'relevance', ROUND(relevance_score::NUMERIC, 4)
      ) ORDER BY relevance_score DESC
    ) as source_citations
    
  FROM context_retrieval
)

SELECT 
  context_string,
  context_documents,
  ROUND(avg_relevance::NUMERIC, 4) as average_context_relevance,
  source_citations,
  
  -- RAG prompt construction
  'You are a helpful assistant that answers questions based on provided context. ' ||
  'Use the following context information to provide accurate answers.' || E'\n\n' ||
  'Context Information:' || E'\n' || context_string || E'\n\n' ||
  'Question: ' || $2::TEXT || E'\n\n' ||
  'Instructions:' || E'\n' ||
  '- Answer based solely on the provided context' || E'\n' ||  
  '- Include source citations using [number] format' || E'\n' ||
  '- If context is insufficient, clearly state what information is missing' || E'\n\n' ||
  'Answer:' as rag_prompt,
  
  -- Query metadata
  $2::TEXT as original_query,
  CURRENT_TIMESTAMP as generated_at

FROM context_preparation;

-- User preference-based semantic search and recommendations  
WITH user_profile AS (
  SELECT 
    user_id,
    preference_embedding,
    preferred_categories,
    preferred_languages,
    interaction_history,
    last_active
  FROM user_profiles
  WHERE user_id = $1::UUID
),

personalized_search AS (
  SELECT 
    d._id,
    d.title,
    d.content,
    d.category,
    d.source,
    d.created_at,
    d.quality_score,
    
    -- Semantic similarity to user preferences
    VECTOR_SIMILARITY(d.embedding, up.preference_embedding, 'cosine') as preference_similarity,
    
    -- Category preference boost
    CASE 
      WHEN d.category = ANY(up.preferred_categories) THEN 1.2
      ELSE 1.0
    END as category_boost,
    
    -- Novelty boost (content user hasn't seen)
    CASE 
      WHEN d._id = ANY(up.interaction_history) THEN 0.8 -- Reduce score for seen content
      ELSE 1.1 -- Boost novel content
    END as novelty_boost,
    
    -- Recency factor
    CASE 
      WHEN d.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1.1
      WHEN d.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1.05
      ELSE 1.0  
    END as recency_boost

  FROM documents_with_vectors d
  CROSS JOIN user_profile up
  WHERE VECTOR_SIMILARITY(d.embedding, up.preference_embedding, 'cosine') >= 0.5
    AND (up.preferred_languages IS NULL OR d.language = ANY(up.preferred_languages))
),

ranked_recommendations AS (
  SELECT *,
    -- Calculate final personalized score
    preference_similarity * category_boost * novelty_boost * recency_boost * (1 + quality_score * 0.3) as personalized_score,
    
    -- Diversity scoring to avoid over-concentration in single category
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY preference_similarity DESC) as category_rank
    
  FROM personalized_search
),

diversified_recommendations AS (
  SELECT *,
    -- Apply diversity penalty for category concentration
    CASE 
      WHEN category_rank <= 2 THEN personalized_score
      WHEN category_rank <= 4 THEN personalized_score * 0.9
      ELSE personalized_score * 0.7
    END as final_recommendation_score
    
  FROM ranked_recommendations
)

SELECT 
  _id,
  title,
  LEFT(content, 300) as content_preview,
  category,
  source,
  created_at,
  
  -- Recommendation scores
  ROUND(preference_similarity::NUMERIC, 4) as user_preference_match,
  ROUND(personalized_score::NUMERIC, 4) as personalized_relevance,
  ROUND(final_recommendation_score::NUMERIC, 4) as recommendation_score,
  
  -- Recommendation explanations
  CASE 
    WHEN category_boost > 1.0 AND novelty_boost > 1.0 THEN 'New content in your preferred categories'
    WHEN category_boost > 1.0 THEN 'Matches your category preferences'
    WHEN novelty_boost > 1.0 THEN 'New content you might find interesting'
    WHEN recency_boost > 1.0 THEN 'Recently published content'
    ELSE 'Recommended based on your preferences'
  END as recommendation_reason,
  
  -- Quality indicators
  CASE 
    WHEN quality_score >= 0.8 AND preference_similarity >= 0.8 THEN 'high_confidence'
    WHEN quality_score >= 0.6 AND preference_similarity >= 0.6 THEN 'medium_confidence'
    ELSE 'exploratory'
  END as confidence_level

FROM diversified_recommendations
ORDER BY final_recommendation_score DESC, preference_similarity DESC  
LIMIT $2::INTEGER; -- recommendation count limit

-- Real-time vector search analytics and performance monitoring
CREATE MATERIALIZED VIEW vector_search_analytics AS
WITH search_performance AS (
  SELECT 
    DATE_TRUNC('hour', search_timestamp) as hour_bucket,
    search_type, -- 'vector', 'text', 'hybrid'
    
    -- Performance metrics
    COUNT(*) as search_count,
    AVG(search_duration_ms) as avg_search_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY search_duration_ms) as p95_search_time,
    AVG(result_count) as avg_results_returned,
    
    -- Quality metrics  
    AVG(avg_similarity_score) as avg_result_relevance,
    COUNT(*) FILTER (WHERE avg_similarity_score >= 0.8) as high_relevance_searches,
    COUNT(*) FILTER (WHERE result_count = 0) as zero_result_searches,
    
    -- User interaction metrics
    COUNT(DISTINCT user_id) as unique_users,
    AVG(user_interaction_score) as avg_user_satisfaction
    
  FROM search_logs
  WHERE search_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', search_timestamp), search_type
),

embedding_performance AS (
  SELECT 
    DATE_TRUNC('hour', created_at) as hour_bucket,
    embedding_model,
    
    -- Embedding metrics
    COUNT(*) as embeddings_generated,
    AVG(embedding_generation_time_ms) as avg_embedding_time,
    AVG(ARRAY_LENGTH(embedding, 1)) as avg_dimensions -- Vector dimension validation
    
  FROM documents_with_vectors
  WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', created_at), embedding_model
)

SELECT 
  sp.hour_bucket,
  sp.search_type,
  
  -- Volume metrics
  sp.search_count,
  sp.unique_users,
  ROUND((sp.search_count::DECIMAL / sp.unique_users)::NUMERIC, 2) as searches_per_user,
  
  -- Performance metrics
  ROUND(sp.avg_search_time::NUMERIC, 2) as avg_search_time_ms,
  ROUND(sp.p95_search_time::NUMERIC, 2) as p95_search_time_ms,
  sp.avg_results_returned,
  
  -- Quality metrics
  ROUND(sp.avg_result_relevance::NUMERIC, 3) as avg_relevance_score,
  ROUND((sp.high_relevance_searches::DECIMAL / sp.search_count * 100)::NUMERIC, 1) as high_relevance_rate_pct,
  ROUND((sp.zero_result_searches::DECIMAL / sp.search_count * 100)::NUMERIC, 1) as zero_results_rate_pct,
  
  -- User satisfaction
  ROUND(sp.avg_user_satisfaction::NUMERIC, 2) as user_satisfaction_score,
  
  -- Embedding performance (when available)
  ep.embeddings_generated,
  ep.avg_embedding_time,
  
  -- Health indicators
  CASE 
    WHEN sp.avg_search_time <= 100 AND sp.avg_result_relevance >= 0.7 THEN 'healthy'
    WHEN sp.avg_search_time <= 500 AND sp.avg_result_relevance >= 0.5 THEN 'acceptable'
    ELSE 'needs_attention'
  END as system_health_status,
  
  -- Recommendations
  CASE 
    WHEN sp.zero_result_searches::DECIMAL / sp.search_count > 0.1 THEN 'Improve embedding coverage'
    WHEN sp.avg_search_time > 1000 THEN 'Optimize vector indexes'
    WHEN sp.avg_result_relevance < 0.6 THEN 'Review similarity thresholds'
    ELSE 'Performance within targets'
  END as optimization_recommendation

FROM search_performance sp
LEFT JOIN embedding_performance ep ON sp.hour_bucket = ep.hour_bucket
ORDER BY sp.hour_bucket DESC, sp.search_type;

-- QueryLeaf provides comprehensive Atlas Vector Search capabilities:
-- 1. SQL-familiar vector search syntax with similarity functions
-- 2. Advanced hybrid search combining vector and full-text capabilities  
-- 3. Built-in RAG pipeline construction with context retrieval and ranking
-- 4. Personalized recommendation systems with user preference integration
-- 5. Real-time analytics and performance monitoring for vector operations
-- 6. Automatic embedding management and vector index optimization
-- 7. Conversational AI support with context-aware search capabilities
-- 8. Production-scale vector search with filtering and metadata integration
-- 9. Comprehensive search quality metrics and optimization recommendations
-- 10. Native integration with MongoDB Atlas Vector Search infrastructure
```

## Best Practices for Atlas Vector Search Implementation

### Vector Index Design and Optimization

Essential practices for production Atlas Vector Search deployments:

1. **Vector Dimensionality**: Choose embedding dimensions based on model requirements and performance constraints
2. **Similarity Metrics**: Select appropriate similarity functions (cosine, euclidean, dot product) for your use case  
3. **Index Configuration**: Configure vector indexes with optimal numCandidates and filter field selections
4. **Metadata Strategy**: Design metadata schemas that enable efficient filtering during vector search
5. **Embedding Quality**: Implement embedding generation strategies that capture semantic meaning effectively
6. **Performance Monitoring**: Deploy comprehensive monitoring for search latency, accuracy, and user satisfaction

### Production AI Application Patterns

Optimize Atlas Vector Search for real-world AI applications:

1. **Hybrid Search**: Combine vector similarity with traditional search for comprehensive results
2. **RAG Optimization**: Implement context selection strategies that balance relevance and diversity
3. **Real-time Updates**: Design pipelines for incremental embedding updates and index maintenance  
4. **Personalization**: Build user preference models that enhance search relevance
5. **Cost Management**: Optimize embedding generation and storage costs through intelligent caching
6. **Security Integration**: Implement proper authentication and access controls for vector data

## Conclusion

MongoDB Atlas Vector Search provides a comprehensive platform for building modern AI applications that require sophisticated semantic search capabilities. By integrating vector search directly into MongoDB's document model, developers can build powerful AI systems without the complexity of managing separate vector databases.

Key Atlas Vector Search benefits include:

- **Native Integration**: Seamless combination of document operations and vector search in a single platform
- **Scalable Architecture**: Built on MongoDB Atlas infrastructure with automatic scaling and management
- **Hybrid Capabilities**: Advanced search patterns combining vector similarity with traditional text search
- **AI-Ready Features**: Built-in support for RAG pipelines, personalization, and conversational AI
- **Production Optimized**: Enterprise-grade security, monitoring, and performance optimization
- **Developer Friendly**: Familiar MongoDB query patterns extended with vector search capabilities

Whether you're building recommendation systems, semantic search engines, RAG-powered chatbots, or other AI applications, MongoDB Atlas Vector Search with QueryLeaf's SQL-familiar interface provides the foundation for modern AI-powered applications that scale efficiently and maintain high performance.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Atlas Vector Search operations while providing SQL-familiar syntax for semantic search, hybrid search patterns, and RAG pipeline construction. Advanced vector search capabilities, personalization systems, and AI application patterns are seamlessly accessible through familiar SQL constructs, making sophisticated AI development both powerful and approachable for SQL-oriented teams.

The combination of MongoDB's flexible document model with advanced vector search capabilities makes it an ideal platform for AI applications that require both semantic understanding and operational flexibility, ensuring your AI systems can evolve with advancing technology while maintaining familiar development patterns.