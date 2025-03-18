# DELETE Operations

The DELETE statement is used to remove documents from MongoDB collections. This page describes the syntax and features of DELETE operations in QueryLeaf.

## Feature Support

| Feature | Support | Notes |
|---------|---------|-------|
| DELETE basic | ✅ Full | Remove documents from collections |
| WHERE clause | ✅ Full | Standard filtering conditions |
| Complex conditions | ✅ Full | Supports AND, OR, and nested conditions |
| Nested field filters | ✅ Full | Filter using dot notation |
| Array element filters | ✅ Full | Filter using array indexing |
| Bulk delete | ✅ Full | Delete multiple documents at once |
| RETURNING clause | ❌ None | Cannot return deleted documents |
| LIMIT in DELETE | ❌ None | Cannot limit number of deleted documents |

## Basic Syntax

```sql
DELETE FROM collection
[WHERE conditions]
```

## Examples

### Basic DELETE

```sql
-- Delete all documents in a collection (use with caution!)
DELETE FROM users

-- Delete documents matching a condition
DELETE FROM products
WHERE category = 'Discontinued'

-- Delete a specific document by _id
DELETE FROM users
WHERE _id = '507f1f77bcf86cd799439011'
```

### Complex Conditions

```sql
-- Delete with multiple conditions
DELETE FROM orders
WHERE status = 'cancelled' AND createdAt < '2023-01-01'

-- Delete with OR condition
DELETE FROM sessions
WHERE expiry < '2023-06-01' OR status = 'invalid'
```

### Working with Nested Fields

```sql
-- Delete based on nested field condition
DELETE FROM users
WHERE address.country = 'Deprecated Country Name'

-- Delete based on nested array element
DELETE FROM orders
WHERE items[0].productId = 'DISC-001'
```

## Translation to MongoDB

When you run a DELETE query, QueryLeaf translates it to MongoDB operations:

| SQL Feature | MongoDB Equivalent |
|-------------|-------------------|
| DELETE FROM collection | db.collection() |
| No WHERE clause | deleteMany({}) |
| WHERE with _id | deleteOne({ _id: ... }) |
| WHERE with conditions | deleteMany({ conditions }) |
| Nested fields in WHERE | Dot notation in filter |

### Example Translation

SQL:
```sql
DELETE FROM orders
WHERE status = 'cancelled' AND createdAt < '2023-01-01'
```

MongoDB:
```javascript
db.collection('orders').deleteMany({
  status: 'cancelled',
  createdAt: { $lt: '2023-01-01' }
})
```

## Performance Considerations

- Add appropriate indexes for fields used in WHERE conditions
- Deleting a specific document by `_id` is the most efficient operation
- For large-scale deletions, consider using MongoDB's bulk operations or aggregation pipeline
- Be careful with DELETE operations without WHERE clauses, as they will remove all documents

## Best Practices

- Always use WHERE conditions unless you explicitly want to delete all documents
- Consider using soft deletes (setting an 'isDeleted' flag) for important data
- Back up data before performing large DELETE operations
- For very large collections, consider a batched approach to deleting documents

## Related Pages

- [INSERT Operations](insert.md)
- [UPDATE Operations](update.md)
- [Working with Nested Fields](nested-fields.md)
- [SELECT Queries](select.md)