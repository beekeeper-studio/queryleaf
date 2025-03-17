# Using JOINs

QueryLeaf supports JOIN operations, which allow you to combine data from multiple MongoDB collections. This page explains how to use JOINs in your SQL queries.

## JOIN Syntax

```sql
SELECT columns
FROM collection1 [alias1]
JOIN collection2 [alias2] ON alias1.field = alias2.field
[WHERE conditions]
[GROUP BY columns]
[ORDER BY columns]
[LIMIT count]
```

## Supported JOIN Types

Currently, QueryLeaf supports:

- INNER JOIN (default JOIN keyword)

Other JOIN types (LEFT, RIGHT, FULL OUTER) are not currently supported.

## Basic JOIN Examples

### Simple JOIN between Collections

```sql
-- Join users and orders collections
SELECT u.name, o.total, o.createdAt
FROM users u
JOIN orders o ON u._id = o.userId
```

### JOIN with Conditions

```sql
-- Join with WHERE conditions
SELECT u.name, o.total, o.status
FROM users u
JOIN orders o ON u._id = o.userId
WHERE o.status = 'completed' AND u.accountType = 'premium'
```

### JOIN with Sorting and Limits

```sql
-- Join with ORDER BY and LIMIT
SELECT u.name, o.total
FROM users u
JOIN orders o ON u._id = o.userId
ORDER BY o.total DESC
LIMIT 10
```

## Working with Multiple JOINs

```sql
-- Multiple JOINs
SELECT u.name, o._id as order_id, p.name as product_name
FROM users u
JOIN orders o ON u._id = o.userId
JOIN order_items oi ON o._id = oi.orderId
JOIN products p ON oi.productId = p._id
WHERE o.status = 'completed'
```

## JOINs with Aggregation

```sql
-- JOIN with GROUP BY
SELECT 
  u.accountType, 
  COUNT(*) as order_count, 
  SUM(o.total) as total_spent
FROM users u
JOIN orders o ON u._id = o.userId
GROUP BY u.accountType
```

## Using Aliases

```sql
-- Using table aliases for clarity
SELECT 
  customer.name as customer_name,
  customer.email,
  purchase.order_id,
  purchase.amount
FROM users customer
JOIN orders purchase ON customer._id = purchase.userId
```

## Translation to MongoDB

QueryLeaf translates JOINs to MongoDB's aggregation framework using `$lookup` and other stages:

| SQL Feature | MongoDB Equivalent |
|-------------|-------------------|
| JOIN | $lookup stage |
| ON condition | localField and foreignField in $lookup |
| WHERE | $match stage |
| ORDER BY | $sort stage |
| LIMIT | $limit stage |
| GROUP BY with JOINs | $lookup + $group stages |

### Example Translation

SQL:
```sql
SELECT u.name, o.total, o.status
FROM users u
JOIN orders o ON u._id = o.userId
WHERE o.status = 'completed'
```

MongoDB:
```javascript
db.collection('users').aggregate([
  {
    $lookup: {
      from: 'orders',
      localField: '_id',
      foreignField: 'userId',
      as: 'o'
    }
  },
  { $unwind: '$o' },
  { $match: { 'o.status': 'completed' } },
  {
    $project: {
      'name': 1,
      'o.total': 1,
      'o.status': 1
    }
  }
])
```

## Performance Considerations

- JOINs in MongoDB are implemented using the aggregation framework, which can be resource-intensive
- Create indexes on the JOIN fields (both the local and foreign fields)
- Consider denormalizing data for frequently joined collections
- Use WHERE conditions to limit the documents before the JOIN when possible
- Be mindful of memory usage when JOINing large collections

## Limitations

- Only INNER JOIN is currently supported
- JOINs can be significantly slower than in traditional SQL databases
- Complex join conditions (beyond equality) are not supported
- Performance degrades quickly with multiple JOINs

## Best Practices

- Use JOINs sparingly in MongoDB - consider alternative schema designs when possible
- Always create indexes on JOIN fields
- Keep JOIN chains short (prefer 1-2 JOINs rather than 3+)
- Use aliases for better readability
- Consider denormalizing data for frequently accessed relationships

## Related Pages

- [SELECT Queries](select.md)
- [GROUP BY and Aggregation](group-by.md)