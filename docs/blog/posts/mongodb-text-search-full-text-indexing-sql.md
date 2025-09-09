---
title: "MongoDB Text Search and Full-Text Indexing: SQL-Style Content Search with Advanced Language Processing"
description: "Master MongoDB text search with full-text indexing, language processing, and SQL-familiar search syntax. Learn advanced text analysis, relevance scoring, and search optimization for content-heavy applications."
date: 2025-09-08
tags: [mongodb, text-search, full-text-indexing, content-search, sql, search-optimization]
---

# MongoDB Text Search and Full-Text Indexing: SQL-Style Content Search with Advanced Language Processing

Modern applications are increasingly content-driven, requiring sophisticated search capabilities that go far beyond simple string matching. Whether you're building a document management system, content management platform, e-commerce catalog, or knowledge base, users expect fast, relevant, and intelligent text search that understands natural language, handles multiple languages, and delivers ranked results.

Traditional database text search often relies on basic `LIKE` operations or external search engines, creating complexity in system architecture and data synchronization. MongoDB's built-in text search capabilities provide native full-text indexing, language-aware search, relevance scoring, and advanced text analysis - all integrated seamlessly with your document database.

## The Traditional Text Search Challenge

Conventional approaches to text search have significant limitations:

```sql
-- SQL basic text search - limited and inefficient
-- Simple pattern matching - no relevance scoring
SELECT 
  article_id,
  title,
  content,
  author,
  published_date
FROM articles
WHERE title LIKE '%mongodb%'
   OR content LIKE '%database%'
   OR content LIKE '%nosql%'
ORDER BY published_date DESC
LIMIT 20;

-- Problems with LIKE-based search:
-- - No relevance ranking or scoring
-- - Case-sensitive matching issues
-- - No stemming (search for "running" won't find "run")
-- - No language-specific processing
-- - Poor performance on large text fields
-- - No phrase matching or proximity search
-- - Cannot handle synonyms or related terms

-- More advanced SQL text search with full-text indexes
CREATE FULLTEXT INDEX article_search_idx ON articles(title, content);

SELECT 
  article_id,
  title,
  MATCH(title, content) AGAINST('mongodb database nosql' IN NATURAL LANGUAGE MODE) as relevance_score
FROM articles
WHERE MATCH(title, content) AGAINST('mongodb database nosql' IN NATURAL LANGUAGE MODE)
ORDER BY relevance_score DESC
LIMIT 20;

-- Limitations even with full-text indexes:
-- - Limited language support and customization
-- - Basic relevance scoring algorithms
-- - Difficulty combining with other query conditions
-- - Limited control over text analysis pipeline
-- - No support for complex document structures
-- - Separate indexing and maintenance overhead
```

MongoDB text search provides comprehensive solutions:

```javascript
// MongoDB native text search - comprehensive and efficient
// Create sophisticated text index with language-specific processing
db.articles.createIndex({
  title: "text",
  content: "text", 
  tags: "text",
  author: "text"
}, {
  weights: {
    title: 10,    // Title matches weighted higher
    content: 5,   // Content matches medium weight
    tags: 8,      // Tag matches high weight
    author: 3     // Author matches lower weight
  },
  default_language: "english",
  language_override: "language", // Per-document language specification
  textIndexVersion: 3,
  name: "comprehensive_text_search"
});

// Powerful text search with relevance scoring and ranking
const searchResults = await db.articles.find({
  $text: {
    $search: "mongodb database nosql performance",
    $language: "english",
    $caseSensitive: false,
    $diacriticSensitive: false
  }
}, {
  score: { $meta: "textScore" },
  title: 1,
  content: 1,
  author: 1,
  published_date: 1,
  tags: 1
}).sort({ 
  score: { $meta: "textScore" } 
}).limit(20);

// Benefits of MongoDB text search:
// - Built-in relevance scoring with customizable weights
// - Language-aware stemming and stop word processing
// - Phrase matching and proximity scoring
// - Case and diacritic insensitive search
// - Integration with other query conditions
// - Support for 15+ languages out of the box
// - Efficient indexing with document structure awareness
// - Real-time search without external dependencies
```

## Understanding MongoDB Text Search

### Text Index Fundamentals

Implement comprehensive text indexing strategies:

```javascript
// Advanced text indexing for content-rich applications
class TextSearchManager {
  constructor(db) {
    this.db = db;
    this.searchConfig = {
      supportedLanguages: [
        'english', 'spanish', 'french', 'german', 'portuguese',
        'russian', 'arabic', 'chinese', 'japanese', 'korean'
      ],
      defaultWeights: {
        title: 10,
        summary: 8,
        content: 5,
        tags: 7,
        category: 6,
        author: 3
      }
    };
  }

  async setupComprehensiveTextIndex(collectionName, indexConfig) {
    const collection = this.db.collection(collectionName);
    
    // Build text index specification
    const indexSpec = {};
    const options = {
      weights: {},
      default_language: indexConfig.defaultLanguage || 'english',
      language_override: indexConfig.languageField || 'language',
      textIndexVersion: 3,
      name: `${collectionName}_comprehensive_text_search`
    };

    // Configure searchable fields with weights
    for (const [field, weight] of Object.entries(indexConfig.fields)) {
      indexSpec[field] = 'text';
      options.weights[field] = weight;
    }

    // Add partial filter for performance
    if (indexConfig.partialFilter) {
      options.partialFilterExpression = indexConfig.partialFilter;
    }

    // Create the text index
    await collection.createIndex(indexSpec, options);
    
    console.log(`Text index created for ${collectionName}:`, {
      fields: Object.keys(indexSpec),
      weights: options.weights,
      language: options.default_language
    });

    return {
      collection: collectionName,
      indexName: options.name,
      configuration: options
    };
  }

  async setupArticleTextSearch() {
    // Specialized text search for article/blog content
    const articleConfig = {
      fields: {
        title: 10,           // Highest priority for title matches
        summary: 8,          // High priority for summary/excerpt
        content: 5,          // Medium priority for body content
        tags: 7,             // High priority for tag matches
        category: 6,         // Medium-high for category matches
        author: 3            // Lower priority for author matches
      },
      defaultLanguage: 'english',
      languageField: 'language',
      partialFilter: { 
        status: 'published',
        deleted: { $ne: true }
      }
    };

    return await this.setupComprehensiveTextIndex('articles', articleConfig);
  }

  async setupProductTextSearch() {
    // E-commerce product search configuration
    const productConfig = {
      fields: {
        name: 10,            // Product name highest priority
        description: 6,      // Product description medium-high
        brand: 8,            // Brand name high priority
        category: 7,         // Category high priority
        tags: 8,             // Product tags high priority
        specifications: 4,   // Technical specs lower priority
        reviews: 3           // Customer review content lowest
      },
      defaultLanguage: 'english',
      languageField: 'language',
      partialFilter: { 
        active: true,
        in_stock: true
      }
    };

    return await this.setupComprehensiveTextIndex('products', productConfig);
  }

  async performTextSearch(collectionName, searchQuery, options = {}) {
    const collection = this.db.collection(collectionName);
    
    // Build text search query
    const textSearchFilter = {
      $text: {
        $search: searchQuery,
        $language: options.language || 'english',
        $caseSensitive: options.caseSensitive || false,
        $diacriticSensitive: options.diacriticSensitive || false
      }
    };

    // Combine with additional filters
    const combinedFilter = { ...textSearchFilter };
    if (options.additionalFilters) {
      Object.assign(combinedFilter, options.additionalFilters);
    }

    // Build projection with text score
    const projection = {
      score: { $meta: "textScore" }
    };
    
    if (options.fields) {
      options.fields.forEach(field => {
        projection[field] = 1;
      });
    }

    // Execute search with scoring and sorting
    const cursor = collection.find(combinedFilter, projection)
      .sort({ score: { $meta: "textScore" } });

    // Apply pagination
    if (options.skip) cursor.skip(options.skip);
    if (options.limit) cursor.limit(options.limit);

    const results = await cursor.toArray();

    // Enhance results with search metadata
    return {
      results: results.map(doc => ({
        ...doc,
        relevanceScore: doc.score,
        searchQuery: searchQuery,
        matchedTerms: this.extractMatchedTerms(doc, searchQuery)
      })),
      searchMetadata: {
        query: searchQuery,
        totalResults: results.length,
        language: options.language || 'english',
        searchTime: new Date(),
        facets: await this.generateSearchFacets(collectionName, combinedFilter, options)
      }
    };
  }

  async performAdvancedTextSearch(collectionName, searchConfig) {
    // Advanced search with multiple query types and aggregation
    const collection = this.db.collection(collectionName);
    
    const pipeline = [];

    // Stage 1: Text search matching
    if (searchConfig.textQuery) {
      pipeline.push({
        $match: {
          $text: {
            $search: searchConfig.textQuery,
            $language: searchConfig.language || 'english'
          }
        }
      });

      // Add text score to documents
      pipeline.push({
        $addFields: {
          textScore: { $meta: "textScore" }
        }
      });
    }

    // Stage 2: Additional filtering
    if (searchConfig.filters) {
      pipeline.push({
        $match: searchConfig.filters
      });
    }

    // Stage 3: Enhanced scoring with business logic
    if (searchConfig.customScoring) {
      pipeline.push({
        $addFields: {
          combinedScore: {
            $add: [
              { $multiply: ["$textScore", searchConfig.textWeight || 1] },
              { $multiply: [
                { $cond: [{ $gte: ["$popularity_score", 80] }, 2, 1] },
                searchConfig.popularityWeight || 0.5
              ]},
              { $multiply: [
                { $cond: [{ $gte: ["$recency_days", 0] }, 
                  { $subtract: [30, "$recency_days"] }, 0] },
                searchConfig.recencyWeight || 0.3
              ]}
            ]
          }
        }
      });
    }

    // Stage 4: Faceted search aggregation
    if (searchConfig.generateFacets) {
      pipeline.push({
        $facet: {
          results: [
            { $sort: { 
              [searchConfig.customScoring ? 'combinedScore' : 'textScore']: -1 
            }},
            { $skip: searchConfig.skip || 0 },
            { $limit: searchConfig.limit || 20 },
            {
              $project: {
                _id: 1,
                title: 1,
                content: { $substr: ["$content", 0, 200] }, // Excerpt
                author: 1,
                category: 1,
                tags: 1,
                published_date: 1,
                textScore: 1,
                combinedScore: searchConfig.customScoring ? 1 : 0,
                highlightedContent: {
                  $function: {
                    body: `function(content, query) {
                      const terms = query.split(' ');
                      let highlighted = content;
                      terms.forEach(term => {
                        const regex = new RegExp(term, 'gi');
                        highlighted = highlighted.replace(regex, '<mark>$&</mark>');
                      });
                      return highlighted.substring(0, 300);
                    }`,
                    args: ["$content", searchConfig.textQuery],
                    lang: "js"
                  }
                }
              }
            }
          ],
          categoryFacets: [
            { $group: { 
              _id: "$category", 
              count: { $sum: 1 },
              avgScore: { $avg: "$textScore" }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          authorFacets: [
            { $group: { 
              _id: "$author", 
              count: { $sum: 1 },
              avgScore: { $avg: "$textScore" }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          tagFacets: [
            { $unwind: "$tags" },
            { $group: { 
              _id: "$tags", 
              count: { $sum: 1 },
              avgScore: { $avg: "$textScore" }
            }},
            { $sort: { count: -1 } },
            { $limit: 15 }
          ],
          dateRangeFacets: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m",
                    date: "$published_date"
                  }
                },
                count: { $sum: 1 },
                avgScore: { $avg: "$textScore" }
              }
            },
            { $sort: { "_id": -1 } },
            { $limit: 12 }
          ]
        }
      });
    } else {
      // Simple results without faceting
      pipeline.push(
        { $sort: { 
          [searchConfig.customScoring ? 'combinedScore' : 'textScore']: -1 
        }},
        { $skip: searchConfig.skip || 0 },
        { $limit: searchConfig.limit || 20 }
      );
    }

    const searchResults = await collection.aggregate(pipeline).toArray();

    return {
      searchResults: searchConfig.generateFacets ? searchResults[0] : { results: searchResults },
      searchMetadata: {
        query: searchConfig.textQuery,
        filters: searchConfig.filters,
        language: searchConfig.language,
        searchTime: new Date(),
        configuration: searchConfig
      }
    };
  }

  async performPhraseSearch(collectionName, phrase, options = {}) {
    // Exact phrase and proximity matching
    const collection = this.db.collection(collectionName);
    
    const searchQueries = [
      // Exact phrase search (quoted)
      {
        query: `"${phrase}"`,
        weight: 3,
        type: 'exact_phrase'
      },
      // Proximity search (words near each other)
      {
        query: phrase.split(' ').join(' '),
        weight: 2,
        type: 'proximity'  
      },
      // Individual terms (fallback)
      {
        query: phrase,
        weight: 1,
        type: 'terms'
      }
    ];

    const results = [];

    for (const searchQuery of searchQueries) {
      const queryResults = await collection.find({
        $text: { $search: searchQuery.query }
      }, {
        score: { $meta: "textScore" },
        title: 1,
        content: 1,
        author: 1,
        published_date: 1
      }).sort({ 
        score: { $meta: "textScore" } 
      }).limit(options.limit || 10).toArray();

      // Weight and tag results by search type
      const weightedResults = queryResults.map(doc => ({
        ...doc,
        searchType: searchQuery.type,
        adjustedScore: doc.score * searchQuery.weight,
        originalScore: doc.score
      }));

      results.push(...weightedResults);
    }

    // Deduplicate and merge results
    const deduplicatedResults = this.deduplicateSearchResults(results);
    
    // Sort by adjusted score
    deduplicatedResults.sort((a, b) => b.adjustedScore - a.adjustedScore);

    return {
      results: deduplicatedResults.slice(0, options.limit || 20),
      phraseQuery: phrase,
      searchStrategies: searchQueries.map(q => q.type)
    };
  }

  async performMultiLanguageSearch(collectionName, searchQuery, languages = []) {
    // Search across multiple languages with language detection
    const collection = this.db.collection(collectionName);
    
    const searchPromises = languages.map(async language => {
      const results = await collection.find({
        $text: {
          $search: searchQuery,
          $language: language
        }
      }, {
        score: { $meta: "textScore" },
        title: 1,
        content: 1,
        language: 1,
        author: 1,
        published_date: 1
      }).sort({ 
        score: { $meta: "textScore" } 
      }).limit(10).toArray();

      return results.map(doc => ({
        ...doc,
        searchLanguage: language,
        languageScore: doc.score
      }));
    });

    const languageResults = await Promise.all(searchPromises);
    const allResults = languageResults.flat();

    // Group by document and select best language match
    const documentMap = new Map();
    
    allResults.forEach(result => {
      const docId = result._id.toString();
      if (!documentMap.has(docId) || 
          documentMap.get(docId).languageScore < result.languageScore) {
        documentMap.set(docId, result);
      }
    });

    const finalResults = Array.from(documentMap.values())
      .sort((a, b) => b.languageScore - a.languageScore);

    return {
      results: finalResults,
      searchQuery: searchQuery,
      languagesSearched: languages,
      languageDistribution: this.calculateLanguageDistribution(finalResults)
    };
  }

  extractMatchedTerms(document, searchQuery) {
    // Extract which search terms matched in the document
    const searchTerms = searchQuery.toLowerCase().split(/\s+/);
    const documentText = [
      document.title || '',
      document.content || '',
      (document.tags || []).join(' '),
      document.author || ''
    ].join(' ').toLowerCase();

    return searchTerms.filter(term => 
      documentText.includes(term)
    );
  }

  async generateSearchFacets(collectionName, baseFilter, options) {
    // Generate search facets for filtering
    const collection = this.db.collection(collectionName);
    
    const facetPipeline = [
      { $match: baseFilter },
      {
        $facet: {
          categories: [
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          authors: [
            { $group: { _id: "$author", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          dateRanges: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y", date: "$published_date" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { "_id": -1 } }
          ]
        }
      }
    ];

    const facetResults = await collection.aggregate(facetPipeline).toArray();
    return facetResults[0] || {};
  }

  deduplicateSearchResults(results) {
    // Remove duplicate documents, keeping highest scored version
    const seen = new Map();
    
    results.forEach(result => {
      const docId = result._id.toString();
      if (!seen.has(docId) || seen.get(docId).adjustedScore < result.adjustedScore) {
        seen.set(docId, result);
      }
    });

    return Array.from(seen.values());
  }

  calculateLanguageDistribution(results) {
    // Calculate distribution of results by language
    const distribution = {};
    
    results.forEach(result => {
      const lang = result.searchLanguage || result.language || 'unknown';
      distribution[lang] = (distribution[lang] || 0) + 1;
    });

    return distribution;
  }

  async createSearchSuggestions(collectionName, partialQuery, options = {}) {
    // Generate search suggestions based on partial input
    const collection = this.db.collection(collectionName);
    
    // Use aggregation to find common terms
    const suggestionPipeline = [
      {
        $match: {
          $or: [
            { title: { $regex: partialQuery, $options: 'i' } },
            { tags: { $regex: partialQuery, $options: 'i' } },
            { category: { $regex: partialQuery, $options: 'i' } }
          ]
        }
      },
      {
        $project: {
          words: {
            $concatArrays: [
              { $split: [{ $toLower: "$title" }, " "] },
              { $ifNull: ["$tags", []] },
              [{ $toLower: "$category" }]
            ]
          }
        }
      },
      { $unwind: "$words" },
      {
        $match: {
          words: { $regex: `^${partialQuery.toLowerCase()}`, $options: 'i' }
        }
      },
      {
        $group: {
          _id: "$words",
          frequency: { $sum: 1 }
        }
      },
      {
        $match: {
          frequency: { $gte: 2 } // Only suggest terms that appear multiple times
        }
      },
      { $sort: { frequency: -1 } },
      { $limit: options.maxSuggestions || 10 }
    ];

    const suggestions = await collection.aggregate(suggestionPipeline).toArray();
    
    return suggestions.map(s => ({
      term: s._id,
      frequency: s.frequency,
      suggestion: s._id
    }));
  }
}
```

### Advanced Text Analysis and Processing

Implement sophisticated text processing capabilities:

```javascript
// Advanced text analysis and custom processing
class TextAnalysisEngine {
  constructor(db) {
    this.db = db;
    this.stopWords = {
      english: ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
      spanish: ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te'],
      french: ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour']
    };
  }

  async analyzeDocumentContent(document, language = 'english') {
    // Comprehensive document analysis for search optimization
    const content = this.extractTextContent(document);
    
    const analysis = {
      documentId: document._id,
      language: language,
      
      // Basic statistics
      wordCount: this.countWords(content),
      characterCount: content.length,
      sentenceCount: this.countSentences(content),
      paragraphCount: this.countParagraphs(content),
      
      // Term analysis
      termFrequency: await this.calculateTermFrequency(content, language),
      keyPhrases: await this.extractKeyPhrases(content, language),
      namedEntities: await this.extractNamedEntities(content),
      
      // Content quality metrics
      readabilityScore: this.calculateReadabilityScore(content),
      contentDensity: this.calculateContentDensity(content),
      uniqueTermsRatio: await this.calculateUniqueTermsRatio(content, language),
      
      // Search optimization data
      suggestedTags: await this.generateSuggestedTags(content, language),
      searchKeywords: await this.extractSearchKeywords(content, language),
      contentSummary: await this.generateContentSummary(content),
      
      analyzedAt: new Date()
    };

    return analysis;
  }

  extractTextContent(document) {
    // Extract searchable text from document structure
    const textFields = [];
    
    if (document.title) textFields.push(document.title);
    if (document.content) textFields.push(document.content);
    if (document.summary) textFields.push(document.summary);
    if (document.description) textFields.push(document.description);
    if (document.tags) textFields.push(document.tags.join(' '));
    
    return textFields.join(' ');
  }

  async calculateTermFrequency(content, language) {
    // Calculate term frequency for search relevance
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Remove stop words
    const stopWords = this.stopWords[language] || this.stopWords.english;
    const filteredWords = words.filter(word => !stopWords.includes(word));

    // Calculate frequency
    const frequency = {};
    filteredWords.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // Return sorted by frequency
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([term, count]) => ({
        term,
        frequency: count,
        percentage: (count / filteredWords.length) * 100
      }));
  }

  async extractKeyPhrases(content, language, maxPhrases = 10) {
    // Extract key phrases (2-3 word combinations)
    const sentences = content.split(/[.!?]+/);
    const phrases = [];

    sentences.forEach(sentence => {
      const words = sentence.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2);

      // Generate 2-word phrases
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        if (!this.isStopWordPhrase(phrase, language)) {
          phrases.push(phrase);
        }
      }

      // Generate 3-word phrases
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (!this.isStopWordPhrase(phrase, language)) {
          phrases.push(phrase);
        }
      }
    });

    // Count phrase frequency
    const phraseFreq = {};
    phrases.forEach(phrase => {
      phraseFreq[phrase] = (phraseFreq[phrase] || 0) + 1;
    });

    return Object.entries(phraseFreq)
      .filter(([phrase, count]) => count >= 2) // Only phrases that appear multiple times
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxPhrases)
      .map(([phrase, frequency]) => ({ phrase, frequency }));
  }

  async extractNamedEntities(content) {
    // Simple named entity recognition
    const entities = {
      persons: [],
      organizations: [],
      locations: [],
      technologies: []
    };

    // Technology terms (common in technical content)
    const techTerms = [
      'mongodb', 'javascript', 'python', 'java', 'react', 'node.js', 'express',
      'angular', 'vue', 'postgresql', 'mysql', 'redis', 'docker', 'kubernetes',
      'aws', 'azure', 'google cloud', 'github', 'gitlab', 'jenkins'
    ];

    const lowerContent = content.toLowerCase();
    
    techTerms.forEach(term => {
      if (lowerContent.includes(term.toLowerCase())) {
        entities.technologies.push({
          entity: term,
          occurrences: (lowerContent.match(new RegExp(term.toLowerCase(), 'g')) || []).length
        });
      }
    });

    // Simple patterns for other entities (can be enhanced with NLP libraries)
    const capitalizedWords = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    
    // Classify capitalized words (simplified heuristic)
    capitalizedWords.forEach(word => {
      if (word.length > 2 && !this.isCommonWord(word)) {
        // Simple classification based on context patterns
        if (content.includes(`${word} Inc`) || content.includes(`${word} Corp`) ||
            content.includes(`${word} Company`) || content.includes(`${word} Ltd`)) {
          entities.organizations.push({ entity: word, confidence: 0.7 });
        } else if (content.includes(`in ${word}`) || content.includes(`at ${word}`) ||
                   content.includes(`${word} city`) || content.includes(`${word} state`)) {
          entities.locations.push({ entity: word, confidence: 0.6 });
        } else {
          entities.persons.push({ entity: word, confidence: 0.5 });
        }
      }
    });

    return entities;
  }

  async generateSuggestedTags(content, language) {
    // Generate suggested tags based on content analysis
    const termFreq = await this.calculateTermFrequency(content, language);
    const keyPhrases = await this.extractKeyPhrases(content, language, 5);
    const entities = await this.extractNamedEntities(content);

    const suggestedTags = [];

    // Add high-frequency terms
    termFreq.slice(0, 5).forEach(term => {
      suggestedTags.push({
        tag: term.term,
        source: 'term_frequency',
        confidence: Math.min(term.percentage / 10, 1.0)
      });
    });

    // Add key phrases
    keyPhrases.forEach(phrase => {
      suggestedTags.push({
        tag: phrase.phrase.replace(/\s+/g, '-'),
        source: 'key_phrase',
        confidence: Math.min(phrase.frequency / 5, 1.0)
      });
    });

    // Add technology entities
    entities.technologies.forEach(tech => {
      suggestedTags.push({
        tag: tech.entity.toLowerCase().replace(/\s+/g, '-'),
        source: 'technology',
        confidence: Math.min(tech.occurrences / 3, 1.0)
      });
    });

    // Sort by confidence and remove duplicates
    return suggestedTags
      .filter(tag => tag.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  async generateContentSummary(content, maxLength = 200) {
    // Generate content summary for search previews
    const sentences = content.split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);

    if (sentences.length === 0) {
      return content.substring(0, maxLength);
    }

    // Score sentences based on term frequency and position
    const termFreq = await this.calculateTermFrequency(content, 'english');
    const importantTerms = termFreq.slice(0, 10).map(t => t.term);

    const sentenceScores = sentences.map((sentence, index) => {
      let score = 0;
      
      // Position score (earlier sentences weighted higher)
      score += Math.max(0, 5 - index) * 0.2;
      
      // Important terms score
      const lowerSentence = sentence.toLowerCase();
      importantTerms.forEach(term => {
        if (lowerSentence.includes(term)) {
          score += 1;
        }
      });

      return { sentence, score, index };
    });

    // Select top sentences while maintaining order
    const selectedSentences = sentenceScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .sort((a, b) => a.index - b.index);

    const summary = selectedSentences
      .map(s => s.sentence)
      .join('. ');

    return summary.length > maxLength ? 
      summary.substring(0, maxLength - 3) + '...' : 
      summary;
  }

  calculateReadabilityScore(content) {
    // Simple readability score calculation
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).length;
    const characters = content.replace(/\s/g, '').length;

    if (sentences === 0 || words === 0) return 0;

    // Simplified Flesch Reading Ease formula
    const avgWordsPerSentence = words / sentences;
    const avgCharsPerWord = characters / words;

    const readabilityScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * (avgCharsPerWord / 5);
    return Math.max(0, Math.min(100, readabilityScore));
  }

  countWords(content) {
    return content.split(/\s+/).filter(word => word.length > 0).length;
  }

  countSentences(content) {
    return content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  }

  countParagraphs(content) {
    return content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
  }

  isStopWordPhrase(phrase, language) {
    const stopWords = this.stopWords[language] || this.stopWords.english;
    const words = phrase.split(' ');
    return words.every(word => stopWords.includes(word));
  }

  isCommonWord(word) {
    const commonWords = ['The', 'This', 'That', 'With', 'From', 'They', 'Have', 'More'];
    return commonWords.includes(word);
  }
}
```

### Search Performance Optimization

Implement search optimization and caching strategies:

```javascript
// Search performance optimization and caching
class SearchOptimizationService {
  constructor(db, cacheService) {
    this.db = db;
    this.cache = cacheService;
    this.searchStats = db.collection('search_statistics');
    this.popularQueries = new Map();
  }

  async setupSearchPerformanceMonitoring() {
    // Monitor and optimize search performance
    const searchCollections = ['articles', 'products', 'documents'];
    
    for (const collection of searchCollections) {
      await this.analyzeTextIndexPerformance(collection);
      await this.setupSearchQueryCaching(collection);
      await this.createSearchAnalytics(collection);
    }
  }

  async analyzeTextIndexPerformance(collectionName) {
    // Analyze text index performance and suggest optimizations
    const collection = this.db.collection(collectionName);
    
    // Get index statistics
    const indexStats = await collection.aggregate([
      { $indexStats: {} },
      { $match: { "key.title": "text" } } // Find text indexes
    ]).toArray();

    // Sample query performance
    const sampleQueries = [
      'database performance optimization',
      'mongodb indexing strategies', 
      'full text search implementation',
      'content management system',
      'real time analytics'
    ];

    const performanceResults = [];

    for (const query of sampleQueries) {
      const startTime = process.hrtime.bigint();
      
      const results = await collection.find({
        $text: { $search: query }
      }, {
        score: { $meta: "textScore" }
      }).sort({ 
        score: { $meta: "textScore" } 
      }).limit(20).toArray();

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      performanceResults.push({
        query,
        resultCount: results.length,
        executionTimeMs: executionTime,
        avgScore: results.length > 0 ? 
          results.reduce((sum, r) => sum + r.score, 0) / results.length : 0
      });
    }

    // Store performance analysis
    await this.db.collection('search_performance').insertOne({
      collection: collectionName,
      indexStats: indexStats,
      queryPerformance: performanceResults,
      averageExecutionTime: performanceResults.reduce((sum, r) => sum + r.executionTimeMs, 0) / performanceResults.length,
      analyzedAt: new Date(),
      recommendations: this.generatePerformanceRecommendations(performanceResults, indexStats)
    });

    return performanceResults;
  }

  async setupSearchQueryCaching(collectionName) {
    // Implement intelligent search result caching
    const originalFind = this.db.collection(collectionName).find;
    const collection = this.db.collection(collectionName);

    // Override find method to add caching for text searches
    collection.findWithCache = async function(query, projection, options = {}) {
      // Only cache text search queries
      if (query.$text) {
        const cacheKey = this.generateCacheKey(query, projection, options);
        const cachedResult = await this.cache.get(cacheKey);

        if (cachedResult) {
          console.log(`Cache hit for search query: ${query.$text.$search}`);
          return cachedResult;
        }

        // Execute query and cache results
        const results = await originalFind.call(collection, query, projection)
          .sort(options.sort || { score: { $meta: "textScore" } })
          .limit(options.limit || 20)
          .toArray();

        // Cache for 5 minutes
        await this.cache.set(cacheKey, results, 300);
        console.log(`Cached search results for: ${query.$text.$search}`);

        return results;
      }

      // Non-text searches use original method
      return originalFind.call(collection, query, projection);
    }.bind(this);
  }

  generateCacheKey(query, projection, options) {
    // Generate consistent cache key for search queries
    const keyData = {
      search: query.$text?.$search,
      language: query.$text?.$language,
      filters: Object.keys(query).filter(k => k !== '$text'),
      projection: projection,
      sort: options.sort,
      limit: options.limit
    };

    return `search_${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  async createSearchAnalytics(collectionName) {
    // Create comprehensive search analytics
    const analyticsData = {
      collection: collectionName,
      date: new Date(),
      
      // Query pattern analysis
      popularSearchTerms: await this.getPopularSearchTerms(collectionName),
      searchFrequency: await this.getSearchFrequencyStats(collectionName),
      noResultsQueries: await this.getNoResultsQueries(collectionName),
      
      // Performance metrics
      avgResponseTime: await this.getAverageResponseTime(collectionName),
      queryComplexityDistribution: await this.getQueryComplexityStats(collectionName),
      
      // Result quality metrics
      clickThroughRates: await this.getClickThroughRates(collectionName),
      searchAbandonmentRate: await this.getSearchAbandonmentRate(collectionName)
    };

    await this.db.collection('search_analytics').insertOne(analyticsData);
    return analyticsData;
  }

  async logSearchQuery(collectionName, query, results, executionTime, userId = null) {
    // Log search queries for analytics
    const searchLog = {
      collection: collectionName,
      query: query,
      resultCount: results.length,
      executionTimeMs: executionTime,
      userId: userId,
      timestamp: new Date(),
      
      // Extract search characteristics
      searchLength: query.$text?.$search?.length || 0,
      searchTerms: query.$text?.$search?.split(' ').length || 0,
      hasFilters: Object.keys(query).length > 1,
      language: query.$text?.$language || 'english'
    };

    await this.searchStats.insertOne(searchLog);
    
    // Update popular queries tracking
    const queryText = query.$text?.$search;
    if (queryText) {
      this.updatePopularQueries(queryText);
    }
  }

  updatePopularQueries(queryText) {
    // Track popular queries in memory for quick access
    const count = this.popularQueries.get(queryText) || 0;
    this.popularQueries.set(queryText, count + 1);

    // Keep only top 100 queries to manage memory
    if (this.popularQueries.size > 100) {
      const sorted = Array.from(this.popularQueries.entries())
        .sort((a, b) => b[1] - a[1]);
      
      this.popularQueries.clear();
      sorted.slice(0, 100).forEach(([query, count]) => {
        this.popularQueries.set(query, count);
      });
    }
  }

  async getPopularSearchTerms(collectionName, limit = 20) {
    // Get most popular search terms from analytics
    const pipeline = [
      { 
        $match: { 
          collection: collectionName,
          timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        }
      },
      {
        $group: {
          _id: "$query.$text.$search",
          searchCount: { $sum: 1 },
          avgResults: { $avg: "$resultCount" },
          avgExecutionTime: { $avg: "$executionTimeMs" }
        }
      },
      { $sort: { searchCount: -1 } },
      { $limit: limit }
    ];

    return await this.searchStats.aggregate(pipeline).toArray();
  }

  async optimizeSearchIndexes(collectionName) {
    // Optimize search indexes based on query patterns
    const collection = this.db.collection(collectionName);
    const analytics = await this.getSearchFrequencyStats(collectionName);
    
    // Analyze frequently searched fields
    const fieldUsage = await this.searchStats.aggregate([
      { $match: { collection: collectionName } },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: 1 },
          avgResultCount: { $avg: "$resultCount" },
          slowQueries: { 
            $sum: { $cond: [{ $gt: ["$executionTimeMs", 100] }, 1, 0] }
          }
        }
      }
    ]).toArray();

    const optimizationRecommendations = [];

    // Check if index optimization is needed
    if (fieldUsage[0]?.slowQueries > fieldUsage[0]?.totalSearches * 0.1) {
      optimizationRecommendations.push({
        type: 'performance',
        recommendation: 'Consider compound indexes for frequently combined query filters',
        priority: 'high'
      });
    }

    if (fieldUsage[0]?.avgResultCount < 5) {
      optimizationRecommendations.push({
        type: 'relevance', 
        recommendation: 'Review text index weights to improve result relevance',
        priority: 'medium'
      });
    }

    return {
      currentPerformance: fieldUsage[0],
      recommendations: optimizationRecommendations,
      suggestedActions: await this.generateOptimizationActions(collectionName)
    };
  }

  generatePerformanceRecommendations(performanceResults, indexStats) {
    const recommendations = [];
    const avgExecutionTime = performanceResults.reduce((sum, r) => sum + r.executionTimeMs, 0) / performanceResults.length;

    if (avgExecutionTime > 50) {
      recommendations.push({
        type: 'performance',
        message: 'Average query execution time is high. Consider index optimization.',
        priority: 'high'
      });
    }

    const lowScoreQueries = performanceResults.filter(r => r.avgScore < 1.0);
    if (lowScoreQueries.length > performanceResults.length * 0.3) {
      recommendations.push({
        type: 'relevance',
        message: 'Many queries return low relevance scores. Review index weights.',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  // Placeholder methods for analytics
  async getSearchFrequencyStats(collection) { /* Implementation */ }
  async getNoResultsQueries(collection) { /* Implementation */ }
  async getAverageResponseTime(collection) { /* Implementation */ }
  async getQueryComplexityStats(collection) { /* Implementation */ }
  async getClickThroughRates(collection) { /* Implementation */ }
  async getSearchAbandonmentRate(collection) { /* Implementation */ }
  async generateOptimizationActions(collection) { /* Implementation */ }
}
```

## SQL-Style Text Search with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB text search operations:

```sql
-- QueryLeaf text search operations with SQL-familiar syntax

-- Basic full-text search with SQL LIKE-style syntax
SELECT 
  article_id,
  title,
  author,
  published_date,
  EXCERPT(content, 200) as content_preview,
  TEXT_SCORE() as relevance_score
FROM articles
WHERE MATCH(title, content, tags) AGAINST ('mongodb database performance optimization')
ORDER BY relevance_score DESC
LIMIT 20;

-- QueryLeaf automatically converts this to:
-- db.articles.find({
--   $text: { $search: "mongodb database performance optimization" }
-- }, {
--   score: { $meta: "textScore" }
-- }).sort({ score: { $meta: "textScore" } }).limit(20)

-- Advanced text search with filters and scoring
SELECT 
  p.product_id,
  p.name,
  p.description,
  p.price,
  p.category,
  p.brand,
  -- Custom relevance scoring with business logic
  (TEXT_SCORE() * 
    CASE 
      WHEN p.rating >= 4.5 THEN 1.5  -- Boost highly rated products
      WHEN p.in_stock = true THEN 1.2 -- Boost available products
      ELSE 1.0
    END
  ) as combined_score,
  
  -- Highlight matching terms in description
  HIGHLIGHT(p.description, 'laptop gaming performance') as highlighted_description

FROM products p
WHERE MATCH(p.name, p.description, p.brand) AGAINST ('laptop gaming performance')
  AND p.price BETWEEN 500 AND 2000
  AND p.category = 'Electronics'
  AND p.in_stock = true
ORDER BY combined_score DESC
LIMIT 50;

-- Multi-language search support
SELECT 
  d.document_id,
  d.title,
  d.content,
  d.language,
  TEXT_SCORE() as relevance
FROM documents d
WHERE (MATCH(d.title, d.content) AGAINST ('artificial intelligence' IN LANGUAGE 'english'))
   OR (MATCH(d.title, d.content) AGAINST ('intelligence artificielle' IN LANGUAGE 'french'))
   OR (MATCH(d.title, d.content) AGAINST ('inteligencia artificial' IN LANGUAGE 'spanish'))
ORDER BY relevance DESC;

-- Phrase search and proximity matching
SELECT 
  article_id,
  title,
  content,
  -- Different types of text matching
  CASE 
    WHEN MATCH(title, content) AGAINST ('"machine learning algorithms"' IN BOOLEAN MODE) THEN 'exact_phrase'
    WHEN MATCH(title, content) AGAINST ('machine learning algorithms' WITH PROXIMITY 5) THEN 'proximity_match'
    WHEN MATCH(title, content) AGAINST ('machine learning algorithms') THEN 'term_match'
  END as match_type,
  TEXT_SCORE() as score
FROM articles
WHERE MATCH(title, content) AGAINST ('machine learning algorithms')
ORDER BY 
  CASE match_type 
    WHEN 'exact_phrase' THEN 1
    WHEN 'proximity_match' THEN 2  
    WHEN 'term_match' THEN 3
  END,
  score DESC;

-- Search with faceted results and aggregations
WITH search_results AS (
  SELECT 
    a.article_id,
    a.title,
    a.content,
    a.author,
    a.category,
    a.tags,
    a.published_date,
    TEXT_SCORE() as relevance
  FROM articles a
  WHERE MATCH(a.title, a.content, a.tags) AGAINST ('data visualization dashboard')
)
SELECT 
  -- Main search results
  sr.article_id,
  sr.title,
  sr.author,
  SUBSTRING(sr.content, 1, 200) as excerpt,
  sr.relevance,
  
  -- Faceted aggregations for filtering
  (SELECT COUNT(*) FROM search_results WHERE category = sr.category) as category_count,
  (SELECT COUNT(*) FROM search_results WHERE author = sr.author) as author_article_count,
  (SELECT AVG(relevance) FROM search_results WHERE category = sr.category) as category_avg_relevance

FROM search_results sr
WHERE sr.relevance > 0.5
ORDER BY sr.relevance DESC
LIMIT 20;

-- Real-time search suggestions and auto-complete
SELECT DISTINCT
  CASE 
    WHEN title LIKE 'mongodb%' THEN EXTRACT_PHRASE(title, 'mongodb', 3)
    WHEN tags LIKE '%mongodb%' THEN EXTRACT_MATCHING_TAG(tags, 'mongodb')
    WHEN content LIKE '%mongodb%' THEN EXTRACT_CONTEXT(content, 'mongodb', 50)
  END as suggestion,
  
  COUNT(*) as frequency,
  AVG(popularity_score) as avg_popularity
  
FROM articles
WHERE (title LIKE '%mongodb%' OR content LIKE '%mongodb%' OR tags LIKE '%mongodb%')
  AND status = 'published'
  AND published_date >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY suggestion
HAVING frequency >= 3
ORDER BY frequency DESC, avg_popularity DESC
LIMIT 10;

-- Search analytics and performance monitoring
SELECT 
  search_term,
  COUNT(*) as search_count,
  AVG(result_count) as avg_results,
  AVG(click_through_rate) as avg_ctr,
  AVG(execution_time_ms) as avg_response_time,
  
  -- Query performance categories
  CASE 
    WHEN AVG(execution_time_ms) < 50 THEN 'fast'
    WHEN AVG(execution_time_ms) < 200 THEN 'medium' 
    ELSE 'slow'
  END as performance_category,
  
  -- Result quality assessment
  CASE 
    WHEN AVG(click_through_rate) > 0.3 THEN 'high_relevance'
    WHEN AVG(click_through_rate) > 0.1 THEN 'medium_relevance'
    ELSE 'low_relevance' 
  END as relevance_quality

FROM search_analytics
WHERE search_date >= CURRENT_DATE - INTERVAL '30 days'
  AND search_term IS NOT NULL
GROUP BY search_term
HAVING search_count >= 10
ORDER BY search_count DESC, avg_ctr DESC;

-- Advanced search with custom scoring algorithms
WITH weighted_search AS (
  SELECT 
    a.*,
    -- Multi-field text scoring
    MATCH(a.title) AGAINST ('machine learning') * 3.0 +
    MATCH(a.content) AGAINST ('machine learning') * 2.0 +
    MATCH(a.tags) AGAINST ('machine learning') * 2.5 +
    MATCH(a.summary) AGAINST ('machine learning') * 1.5 as text_score,
    
    -- Business logic scoring
    CASE a.content_type
      WHEN 'tutorial' THEN 1.5
      WHEN 'reference' THEN 1.2
      WHEN 'news' THEN 0.8
      ELSE 1.0
    END as content_type_boost,
    
    -- Recency scoring (newer content boosted)
    POWER(0.99, DATEDIFF(CURRENT_DATE, a.published_date)) as recency_score,
    
    -- Author authority scoring
    (SELECT AVG(view_count) FROM articles WHERE author = a.author) / 1000 as author_authority

  FROM articles a
  WHERE MATCH(a.title, a.content, a.tags) AGAINST ('machine learning')
)
SELECT 
  article_id,
  title,
  author,
  published_date,
  -- Combined relevance score
  (text_score * content_type_boost * recency_score * (1 + author_authority)) as final_score,
  
  -- Score components for debugging
  text_score,
  content_type_boost,
  recency_score,
  author_authority

FROM weighted_search
WHERE final_score > 1.0
ORDER BY final_score DESC
LIMIT 25;

-- Search result clustering and categorization
SELECT 
  cluster_category,
  COUNT(*) as article_count,
  AVG(relevance_score) as avg_relevance,
  STRING_AGG(DISTINCT author, ', ') as contributing_authors,
  MIN(published_date) as earliest_article,
  MAX(published_date) as latest_article

FROM (
  SELECT 
    a.article_id,
    a.title,
    a.author,
    a.published_date,
    TEXT_SCORE() as relevance_score,
    
    -- Automatic categorization based on content analysis
    CASE 
      WHEN MATCH(a.content) AGAINST ('tutorial guide how-to step-by-step') THEN 'tutorials'
      WHEN MATCH(a.content) AGAINST ('documentation reference API specification') THEN 'documentation'  
      WHEN MATCH(a.content) AGAINST ('news announcement release update') THEN 'news'
      WHEN MATCH(a.content) AGAINST ('analysis opinion editorial review') THEN 'analysis'
      ELSE 'general'
    END as cluster_category
    
  FROM articles a
  WHERE MATCH(a.title, a.content, a.tags) AGAINST ('javascript frameworks comparison')
    AND a.status = 'published'
) clustered_results
GROUP BY cluster_category
ORDER BY article_count DESC, avg_relevance DESC;

-- QueryLeaf provides comprehensive text search features:
-- 1. SQL-familiar MATCH...AGAINST syntax for text queries
-- 2. Built-in relevance scoring with TEXT_SCORE() function
-- 3. Phrase matching, proximity search, and boolean operators
-- 4. Multi-language search support with language detection
-- 5. Search result highlighting and excerpt generation
-- 6. Custom scoring algorithms with business logic
-- 7. Search analytics and performance monitoring
-- 8. Faceted search with aggregated filtering options
-- 9. Real-time search suggestions and auto-completion
-- 10. Integration with MongoDB's native text indexing capabilities
```

## Best Practices for Text Search

### Index Strategy and Optimization

Design efficient text search architectures:

1. **Field Weighting**: Assign appropriate weights based on field importance and search patterns
2. **Language Configuration**: Configure proper language settings for stemming and stop word processing
3. **Partial Filtering**: Use partial filter expressions to index only relevant documents
4. **Compound Indexes**: Combine text indexes with other query conditions for optimal performance
5. **Index Maintenance**: Monitor and maintain text indexes for optimal search performance
6. **Resource Management**: Consider memory and storage requirements for text indexes

### Search Quality and Relevance

Optimize search quality and user experience:

1. **Relevance Tuning**: Continuously tune search weights and scoring algorithms
2. **Query Analysis**: Analyze search queries to understand user intent and improve results
3. **Result Presentation**: Present search results with proper highlighting and excerpts
4. **Faceted Navigation**: Provide filtering options to help users refine search results
5. **Search Analytics**: Implement comprehensive search analytics to measure and improve performance
6. **User Feedback**: Incorporate user feedback to continuously improve search relevance

## Conclusion

MongoDB text search with full-text indexing provides powerful, native search capabilities that eliminate the need for external search engines while delivering sophisticated language processing, relevance scoring, and search optimization. Combined with SQL-familiar search syntax, MongoDB enables comprehensive text search functionality that integrates seamlessly with your application data and queries.

Key text search benefits include:

- **Native Integration**: Built-in search functionality without external dependencies
- **Language Intelligence**: Support for 15+ languages with proper stemming and stop word processing
- **Relevance Scoring**: Sophisticated scoring algorithms with customizable weighting
- **Performance Optimization**: Efficient indexing and query processing for fast search results
- **Flexible Querying**: Combine text search with other query conditions and aggregations

Whether you're building content management systems, e-commerce search, knowledge bases, or document repositories, MongoDB text search with QueryLeaf's familiar SQL interface provides the foundation for sophisticated search functionality. This combination enables you to implement powerful text search capabilities while preserving the development patterns and query approaches your team already knows.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB text index creation, optimization, and maintenance while providing SQL-familiar MATCH...AGAINST syntax and search result functions. Complex text analysis, multi-language support, and custom scoring algorithms are seamlessly handled through familiar SQL patterns, making advanced text search both powerful and accessible.

The integration of native text search with SQL-style query syntax makes MongoDB an ideal platform for applications requiring both sophisticated search functionality and familiar database interaction patterns, ensuring your search features remain both effective and maintainable as they scale and evolve.