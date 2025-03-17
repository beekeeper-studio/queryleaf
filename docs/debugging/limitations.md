# Limitations and Known Issues

This page documents the current limitations and known issues of QueryLeaf. Understanding these limitations will help you work more effectively with the library and avoid potential pitfalls.

## SQL Feature Limitations

### Unsupported SQL Features

The following SQL features are currently not supported by QueryLeaf:

| Feature | Status | Notes |
|---------|--------|-------|
| Subqueries | Not Supported | Nested SELECT queries in FROM or WHERE clauses are not supported |
| LEFT/RIGHT/FULL OUTER JOIN | Not Supported | Only INNER JOIN is currently implemented |
| UNION/INTERSECT/EXCEPT | Not Supported | Combining result sets is not supported |
| HAVING Clause | Limited Support | Only basic HAVING conditions are supported |
| Window Functions | Not Supported | Functions like ROW_NUMBER(), RANK(), etc. are not supported |
| Common Table Expressions (CTE) | Not Supported | WITH clauses are not supported |
| CASE Statements | Not Supported | Conditional expressions are not yet implemented |
| Stored Procedures | Not Supported | MongoDB doesn't have a direct equivalent |
| Views | Not Supported | Creating and querying views is not supported |
| Transactions | Not Supported | MongoDB transaction support is not implemented |
| OFFSET | Not Supported | MongoDB's skip() is not exposed through SQL |
| CREATE/ALTER/DROP Statements | Not Supported | Schema manipulation is not supported |

### Partially Supported Features

Some SQL features have partial or limited support:

| Feature | Limitations |
|---------|-------------|
| JOIN | Only INNER JOIN with simple equality conditions is supported |
| GROUP BY | Complex expressions in GROUP BY are not supported |
| ORDER BY | Only simple column references and ASC/DESC are supported |
| Aggregation Functions | Limited to COUNT, SUM, AVG, MIN, MAX |
| LIKE | Basic pattern matching only; complex regex not supported |
| Data Types | Limited type conversion; no special handling for dates or timestamps |

## MongoDB-Specific Limitations

### MongoDB Features Not Exposed

QueryLeaf doesn't expose all MongoDB features through SQL:

- Geospatial queries and indexes
- Text search capabilities
- MongoDB aggregation pipeline stages like $facet, $bucket, $sortByCount
- Array manipulation operators like $push, $slice, $filter
- MongoDB specific update operators like $inc, $mul, $rename
- Aggregation expressions
- MongoDB indexes and index hints

### Performance Considerations

- **JOIN Operations**: Translated to MongoDB `$lookup` stages, which can be resource-intensive
- **Array Access**: Queries with array element access may perform poorly on large arrays
- **Complex Aggregations**: Certain GROUP BY queries generate complex aggregation pipelines
- **Missing Indexes**: Queries without appropriate MongoDB indexes will perform poorly

## Implementation Limitations

### Parser Limitations

- **SQL Dialect**: Uses PostgreSQL dialect with extensions; some PostgreSQL-specific syntax may not work
- **SQL Parsing Errors**: Complex or uncommon SQL syntax might fail to parse
- **Query Length**: Very large SQL queries may cause parsing performance issues
- **Comment Support**: SQL comments are not fully supported in all contexts

### Compiler Limitations

- **Expression Support**: Limited support for complex expressions in SELECT list
- **Nested Array Access**: Deep array access (items[0].subitems[1]) may not work correctly
- **Function Support**: Limited support for SQL functions
- **Query Optimization**: No automatic query optimization or index selection
- **Error Messages**: Error messages may not always clearly indicate the underlying issue

### Executor Limitations

- **Large Results**: Very large result sets may cause memory issues
- **Streaming**: No native support for streaming large result sets
- **Connection Management**: Relies on user-provided MongoDB client
- **Monitoring**: No built-in query monitoring or performance metrics
- **Authentication**: Authentication handled entirely by MongoDB client

## Workarounds for Common Limitations

### Alternative to Subqueries

Instead of using subqueries, consider:

1. Breaking down complex queries into multiple simpler queries
2. Using application logic to combine results
3. Denormalizing your data model to reduce the need for complex queries

```typescript
// Instead of this (not supported):
// SELECT * FROM users WHERE _id IN (SELECT userId FROM orders WHERE total > 100)

// Use multiple queries:
const highValueOrders = await queryLeaf.execute(
  'SELECT DISTINCT userId FROM orders WHERE total > 100'
);

const userIds = highValueOrders.map(order => order.userId);
const userIdList = userIds.map(id => `'${id}'`).join(',');

const users = await queryLeaf.execute(
  `SELECT * FROM users WHERE _id IN (${userIdList})`
);
```

### Alternative to OUTER JOINs

Instead of OUTER JOINs, consider:

1. Using separate queries and merging results in your application
2. Modeling data differently to avoid needing OUTER JOINs
3. Using INNER JOIN and handling missing records in your application

```typescript
// Instead of LEFT OUTER JOIN (not supported), use separate queries:
const users = await queryLeaf.execute('SELECT * FROM users');

// Then for each user, query their orders
for (const user of users) {
  user.orders = await queryLeaf.execute(
    `SELECT * FROM orders WHERE userId = '${user._id}'`
  );
}
```

### Handling Complex GROUP BY

For complex GROUP BY operations:

1. Break down the aggregation into multiple steps
2. Use MongoDB's native aggregation for very complex operations
3. Pre-aggregate data where possible

### Pagination Without OFFSET

Since OFFSET is not supported, implement pagination using:

1. _id-based pagination (more efficient)
2. Skip parameter in the MongoDB native driver
3. Limit + client-side filtering

```typescript
// Paginate using _id comparison (effective with proper indexing)
async function paginateByIdCursor(pageSize = 10, lastId = null) {
  let query = 'SELECT * FROM users';
  
  if (lastId) {
    query += ` WHERE _id > '${lastId}'`;
  }
  
  query += ` ORDER BY _id LIMIT ${pageSize}`;
  return await queryLeaf.execute(query);
}

// Usage:
let lastId = null;
let hasMore = true;

while (hasMore) {
  const results = await paginateByIdCursor(10, lastId);
  
  if (results.length < 10) {
    hasMore = false;
  } else {
    lastId = results[results.length - 1]._id;
  }
  
  // Process results...
}
```

## Future Improvements

The QueryLeaf team is actively working on addressing these limitations in future releases:

- Support for LEFT OUTER JOIN
- Improved error reporting and diagnostics
- Support for more SQL functions and expressions
- Performance optimizations for complex queries
- Better handling of data types, especially dates and ObjectIDs
- Support for subqueries in WHERE clauses

For the most up-to-date information on planned improvements and features, please visit the [GitHub repository](https://github.com/beekeeper-studio/queryleaf).

## Reporting Issues

If you encounter issues not documented here, please report them on the [GitHub issue tracker](https://github.com/beekeeper-studio/queryleaf/issues) with:

1. A minimal, reproducible example
2. The SQL query you're trying to execute
3. The expected behavior
4. The actual behavior or error message
5. Your QueryLeaf and MongoDB versions