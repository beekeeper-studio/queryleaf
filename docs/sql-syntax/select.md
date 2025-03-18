# SELECT Queries

The SELECT statement is used to retrieve documents from MongoDB collections. This page describes the syntax and features of SELECT queries in QueryLeaf.

## Feature Support

| Feature | Support | Notes |
|---------|---------|-------|
| SELECT columns | ✅ Full | Both `*` and specific columns supported |
| FROM collection | ✅ Full | Single collection per query |
| WHERE conditions | ✅ Full | All standard operators supported |
| GROUP BY | ✅ Full | Supports aggregation functions |
| ORDER BY | ✅ Full | ASC and DESC supported |
| LIMIT | ✅ Full | Limits result set size |
| OFFSET | ✅ Full | Supports pagination |
| JOINs | ⚠️ Partial | Only INNER JOIN currently supported |
| Column aliases | ✅ Full | Using AS keyword |
| Table aliases | ✅ Full | Useful for JOIN statements |
| Nested fields | ✅ Full | Using dot notation |
| Array access | ✅ Full | Using bracket notation |

## Basic Syntax

```sql
SELECT [columns]
FROM collection [alias]
[WHERE conditions]
[GROUP BY columns]
[ORDER BY columns [ASC|DESC]]
[LIMIT count]
[OFFSET count]
```

## Examples

### Simple SELECT

```sql
-- Select all fields from the users collection
SELECT * FROM users

-- Select specific fields
SELECT name, email, age FROM users

-- Limit the number of results
SELECT * FROM users LIMIT 10
```

### WHERE Clause

```sql
-- Simple equality condition
SELECT * FROM users WHERE status = 'active'

-- Comparison operators
SELECT * FROM products WHERE price > 100
SELECT * FROM users WHERE age >= 21
SELECT * FROM products WHERE stock < 10

-- Multiple conditions with AND
SELECT * FROM users WHERE status = 'active' AND age > 21

-- Multiple conditions with OR
SELECT * FROM products WHERE category = 'Electronics' OR category = 'Computers'

-- Complex conditions
SELECT * FROM users 
WHERE (status = 'active' OR status = 'pending') AND age > 21
```

### ORDER BY Clause

```sql
-- Simple ascending sort (ASC is default)
SELECT * FROM users ORDER BY name

-- Descending sort
SELECT * FROM products ORDER BY price DESC

-- Multiple sort fields
SELECT * FROM users ORDER BY age DESC, name ASC
```

### LIMIT and OFFSET Clauses

```sql
-- Limit to 10 results
SELECT * FROM products LIMIT 10

-- Limit with ORDER BY
SELECT * FROM products ORDER BY price DESC LIMIT 5

-- Skip first 10 results
SELECT * FROM products OFFSET 10

-- Pagination: Get the second page of 10 results
SELECT * FROM products LIMIT 10 OFFSET 10

-- Pagination with ordering: Get the third page of 5 results sorted by price
SELECT * FROM products ORDER BY price DESC LIMIT 5 OFFSET 10
```

## Column Aliases

You can alias columns using the `AS` keyword:

```sql
SELECT 
  name, 
  email AS contact_email,
  age AS user_age
FROM users
```

## Table Aliases

Table aliases are especially useful in JOINs:

```sql
-- Using table alias
SELECT u.name, u.email 
FROM users u 
WHERE u.status = 'active'
```

## Working with _id Field and ObjectIDs

MongoDB's `_id` field can be used in queries like any other field:

```sql
-- Query by _id (string will be converted to ObjectID)
SELECT * FROM users WHERE _id = '507f1f77bcf86cd799439011'

-- Include _id in results
SELECT _id, name, email FROM users

-- Query by reference ID field
SELECT o.* FROM orders o WHERE o.customerId = '507f1f77bcf86cd799439011'
```

### ObjectID Conversion

QueryLeaf automatically converts string values to MongoDB ObjectID objects in WHERE clauses when:

1. The field name is `_id`
2. The field name ends with `Id` (e.g., `userId`, `productId`)
3. The field name ends with `Ids` (for arrays of IDs)
4. The string follows the MongoDB ObjectID format (24 hex characters)

This means you can use string literals in your SQL queries, and QueryLeaf will handle the conversion to ObjectID objects for you.

```sql
-- Both of these will work correctly with QueryLeaf's automatic conversion
SELECT * FROM orders WHERE _id = '507f1f77bcf86cd799439011'
SELECT * FROM orders WHERE productId = '609f1f77bcf86cd799439a22'
```

## MongoDB-Specific Features

### Projecting Nested Fields

```sql
-- Select nested fields
SELECT name, address.city, address.state 
FROM users 
WHERE address.country = 'USA'
```

### Projecting Array Elements

```sql
-- Select specific array elements
SELECT 
  customer, 
  items[0].name AS first_item,
  items[0].price AS first_item_price
FROM orders
```

## Translation to MongoDB

When you run a SELECT query, QueryLeaf translates it to MongoDB operations:

| SQL Feature | MongoDB Equivalent |
|-------------|-------------------|
| SELECT columns | Projection object in find() |
| FROM collection | Collection to query |
| WHERE | Query filter object |
| ORDER BY | Sort object |
| LIMIT | limit() method |
| OFFSET | skip() method |
| Nested fields | Dot notation fields |
| Array access | Dot notation with array indices |

### Example Translation

SQL:
```sql
SELECT name, email, address.city 
FROM users 
WHERE age > 21 AND status = 'active' 
ORDER BY name ASC 
LIMIT 10
OFFSET 5
```

MongoDB:
```javascript
db.collection('users').find(
  { age: { $gt: 21 }, status: 'active' },
  { name: 1, email: 1, 'address.city': 1 }
).sort({ name: 1 }).skip(5).limit(10)
```

## Performance Considerations

- Add appropriate MongoDB indexes for fields used in WHERE and ORDER BY clauses
- Use LIMIT to restrict result set size
- Use OFFSET in combination with LIMIT for pagination
- Be aware that sorting (ORDER BY) without an index can be expensive 
- Queries on nested fields benefit from compound indexes that include the full path
- Using OFFSET with large values may be inefficient as MongoDB must still process all skipped documents

## Advanced Usage

For advanced querying needs like JOINs, GROUP BY, and aggregation functions, see the following pages:

- [GROUP BY and Aggregation](group-by.md)
- [Using JOINs](joins.md)
- [Working with Nested Fields](nested-fields.md)
- [Working with Array Access](array-access.md)