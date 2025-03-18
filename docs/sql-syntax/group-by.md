# GROUP BY and Aggregation

The GROUP BY clause is used to group documents based on specified fields and perform aggregation operations. This page explains how to use GROUP BY and aggregation functions in QueryLeaf.

## Feature Support

| Feature | Support | Notes |
|---------|---------|-------|
| Basic GROUP BY | ✅ Full | Group by single or multiple fields |
| COUNT(*) | ✅ Full | Count documents in each group |
| COUNT(field) | ✅ Full | Count non-null values in each group |
| SUM | ✅ Full | Sum of values in each group |
| AVG | ✅ Full | Average of values in each group |
| MIN | ✅ Full | Minimum value in each group |
| MAX | ✅ Full | Maximum value in each group |
| Nested field grouping | ✅ Full | Group by embedded document fields |
| ORDER BY with GROUP BY | ✅ Full | Sort grouped results |
| HAVING clause | ⚠️ Limited | Limited support for filtering groups |
| Complex expressions | ⚠️ Limited | Limited support in grouping expressions |
| Window functions | ❌ None | No support for window functions |

## GROUP BY Syntax

```sql
SELECT 
  columns,
  AGG_FUNCTION(column) AS alias
FROM collection
[WHERE conditions]
GROUP BY columns
[ORDER BY columns]
```

## Supported Aggregation Functions

QueryLeaf supports the following aggregation functions:

| Function | Description |
|----------|-------------|
| COUNT(*) | Count the number of documents in each group |
| COUNT(field) | Count non-null values of a field in each group |
| SUM(field) | Sum of field values in each group |
| AVG(field) | Average of field values in each group |
| MIN(field) | Minimum field value in each group |
| MAX(field) | Maximum field value in each group |

## Basic GROUP BY Examples

### Simple GROUP BY

```sql
-- Group by single field
SELECT category, COUNT(*) as count
FROM products
GROUP BY category

-- Group by single field with conditions
SELECT status, COUNT(*) as count
FROM orders
WHERE createdAt > '2023-01-01'
GROUP BY status
```

### Multiple Aggregation Functions

```sql
-- Multiple aggregation functions
SELECT 
  category,
  COUNT(*) as count,
  AVG(price) as avg_price,
  MIN(price) as min_price,
  MAX(price) as max_price,
  SUM(price) as total_value
FROM products
GROUP BY category
```

### Sorting Grouped Results

```sql
-- GROUP BY with ORDER BY
SELECT category, COUNT(*) as count
FROM products
GROUP BY category
ORDER BY count DESC

-- Multiple sort fields
SELECT status, COUNT(*) as count, SUM(total) as revenue
FROM orders
GROUP BY status
ORDER BY revenue DESC, count ASC
```

## GROUP BY with Multiple Fields

```sql
-- Group by multiple fields
SELECT 
  category, 
  manufacturer, 
  COUNT(*) as count,
  AVG(price) as avg_price
FROM products
GROUP BY category, manufacturer
```

## GROUP BY with Nested Fields

```sql
-- Group by nested field
SELECT 
  address.city, 
  COUNT(*) as user_count
FROM users
GROUP BY address.city
```

## Translation to MongoDB

QueryLeaf translates GROUP BY operations to MongoDB's aggregation framework:

| SQL Feature | MongoDB Equivalent |
|-------------|-------------------|
| GROUP BY | $group stage |
| COUNT(*) | $sum: 1 |
| SUM(field) | $sum: '$field' |
| AVG(field) | $avg: '$field' |
| MIN(field) | $min: '$field' |
| MAX(field) | $max: '$field' |
| WHERE with GROUP BY | $match stage before $group |
| ORDER BY with GROUP BY | $sort stage after $group |

### Example Translation

SQL:
```sql
SELECT 
  category, 
  COUNT(*) as count, 
  AVG(price) as avg_price
FROM products
WHERE stock > 0
GROUP BY category
ORDER BY count DESC
```

MongoDB:
```javascript
db.collection('products').aggregate([
  { $match: { stock: { $gt: 0 } } },
  { 
    $group: {
      _id: '$category',
      category: { $first: '$category' },
      count: { $sum: 1 },
      avg_price: { $avg: '$price' }
    }
  },
  { $sort: { count: -1 } }
])
```

## Performance Considerations

- GROUP BY operations use MongoDB's aggregation framework, which can be resource-intensive
- Create indexes on fields used in GROUP BY and WHERE clauses
- Be mindful of memory usage when grouping large collections
- Consider using the allowDiskUse option for large datasets (via MongoDB driver)
- Aggregation pipelines with multiple stages can impact performance

## Limitations

- Limited support for HAVING clause
- No support for window functions
- Limited support for complex expressions in GROUP BY
- Non-standard handling of NULL values in grouping

## Best Practices

- Use WHERE conditions to limit the documents before grouping
- Create indexes on frequently grouped fields
- Keep aggregation pipelines simple when possible
- Consider using MongoDB's native aggregation for very complex operations
- For time-based grouping, consider pre-processing dates

## Related Pages

- [SELECT Queries](select.md)
- [Using JOINs](joins.md)
- [Working with Nested Fields](nested-fields.md)