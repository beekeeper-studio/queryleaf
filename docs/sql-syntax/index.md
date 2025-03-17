# SQL Syntax Support

QueryLeaf translates PostgreSQL-compatible SQL queries into MongoDB commands, supporting a subset of SQL syntax with extensions for MongoDB-specific features. This page provides an overview of supported SQL syntax, while subsequent pages detail each feature.

> **Note:** QueryLeaf uses the PostgreSQL dialect of SQL. All examples and syntax shown throughout the documentation follow PostgreSQL conventions.

## Supported SQL Operations

QueryLeaf supports the following SQL operations:

| Operation | Status | Description |
|-----------|--------|-------------|
| SELECT    | ✅ Full | Retrieve documents from collections |
| INSERT    | ✅ Full | Insert new documents into collections |
| UPDATE    | ✅ Full | Update existing documents in collections |
| DELETE    | ✅ Full | Remove documents from collections |
| JOIN      | ⚠️ Partial | Join collections (currently INNER JOIN only) |
| GROUP BY  | ✅ Full | Group and aggregate data |
| ORDER BY  | ✅ Full | Sort results |
| LIMIT     | ✅ Full | Limit number of results |
| OFFSET    | ❌ Not Supported | Skip results (use MongoDB skip instead) |
| DISTINCT  | ❌ Not Supported | Remove duplicates |
| UNION     | ❌ Not Supported | Combine results from multiple queries |
| Subqueries| ❌ Not Supported | Nested queries |
| Views     | ❌ Not Supported | Stored queries |

## MongoDB-Specific Extensions

QueryLeaf extends standard SQL syntax to support MongoDB features:

- **Nested Field Access**: Query nested document fields using dot notation (e.g., `address.city`)
- **Array Element Access**: Access array elements using index notation (e.g., `items[0].name`)
- **Document Literals**: Insert and update with document literals in SQL

## SQL SELECT Syntax

```sql
SELECT [columns]
FROM collection [alias]
[JOIN other_collection ON join_condition]
[WHERE conditions]
[GROUP BY columns]
[HAVING aggregate_conditions]
[ORDER BY columns [ASC|DESC]]
[LIMIT count]
```

## SQL INSERT Syntax

```sql
INSERT INTO collection (column1, column2, ...)
VALUES (value1, value2, ...), (value1, value2, ...), ...
```

## SQL UPDATE Syntax

```sql
UPDATE collection
SET column1 = value1, column2 = value2, ...
[WHERE conditions]
```

## SQL DELETE Syntax

```sql
DELETE FROM collection
[WHERE conditions]
```

## WHERE Clause Operators

QueryLeaf supports a wide range of operators in WHERE clauses:

| Operator | Description | Example |
|----------|-------------|---------|
| =        | Equals | `WHERE age = 25` |
| !=, <>   | Not equals | `WHERE status != 'inactive'` |
| >        | Greater than | `WHERE age > 21` |
| >=       | Greater than or equal | `WHERE price >= 10.99` |
| <        | Less than | `WHERE quantity < 5` |
| <=       | Less than or equal | `WHERE ratings <= 3` |
| AND      | Logical AND | `WHERE age > 21 AND status = 'active'` |
| OR       | Logical OR | `WHERE role = 'admin' OR role = 'manager'` |
| IN       | In a list | `WHERE status IN ('active', 'pending')` |
| NOT IN   | Not in a list | `WHERE category NOT IN ('archived', 'deleted')` |
| LIKE     | Pattern matching | `WHERE name LIKE 'A%'` |
| BETWEEN  | Between two values | `WHERE age BETWEEN 18 AND 65` |
| IS NULL  | Is null | `WHERE description IS NULL` |
| IS NOT NULL | Is not null | `WHERE email IS NOT NULL` |

## Aggregation Functions

QueryLeaf supports these aggregation functions in GROUP BY clauses:

| Function | Description | Example |
|----------|-------------|---------|
| COUNT    | Count documents | `COUNT(*) as count` |
| SUM      | Sum values | `SUM(price) as total` |
| AVG      | Average values | `AVG(rating) as avg_rating` |
| MIN      | Minimum value | `MIN(price) as min_price` |
| MAX      | Maximum value | `MAX(age) as max_age` |

## MongoDB-Specific Features

### Nested Field Access

```sql
-- Query nested fields
SELECT name, address.city, address.state FROM users WHERE address.zip = '10001'

-- Update nested fields
UPDATE users SET address.city = 'New York', address.state = 'NY' WHERE _id = 123
```

### Array Element Access

```sql
-- Query by array element
SELECT * FROM orders WHERE items[0].name = 'Laptop'

-- Project specific array elements
SELECT _id, customer, items[0].name, items[0].price FROM orders
```

### Document Literals in INSERT

```sql
INSERT INTO users (name, age, address) VALUES 
('John Doe', 30, {
  "street": "123 Main St",
  "city": "Boston",
  "state": "MA",
  "zip": "02101"
})
```

### Working with MongoDB ObjectIDs

QueryLeaf automatically handles MongoDB's ObjectIDs by converting string representations to ObjectID objects when:

1. The field name is `_id`
2. The field name ends with `Id` (e.g., `userId`)
3. The field name ends with `Ids` (for arrays of IDs)

```sql
-- Query by ObjectID
SELECT * FROM users WHERE _id = '507f1f77bcf86cd799439011'

-- Query by a reference ID field
SELECT * FROM orders WHERE userId = '507f1f77bcf86cd799439011'

-- Insert with explicit ObjectID (string will be converted)
INSERT INTO users (_id, name, email) 
VALUES ('507f1f77bcf86cd799439011', 'John Doe', 'john@example.com')
```

## Known Limitations

QueryLeaf has the following limitations:

1. **JOIN Support**: Only INNER JOIN is currently supported; LEFT, RIGHT, and FULL OUTER JOIN are not implemented
2. **Subqueries**: Subqueries are not supported
3. **Complex Functions**: Limited support for SQL functions
4. **Data Types**: Limited handling of complex data types
5. **OFFSET**: Not supported (use MongoDB's native skip functionality instead)
6. **CASE Statements**: Not yet supported
7. **Window Functions**: Not supported
8. **Transactions**: Not supported

## SQL Dialect Information

QueryLeaf uses the PostgreSQL SQL dialect via the node-sql-parser library. All queries should follow PostgreSQL syntax conventions, including:

- Double quotes for identifiers with special characters or capitalization (`SELECT * FROM "Users"`)
- Single quotes for string literals (`WHERE name = 'John'`)
- Dollar-quoted string literals for complex strings (`$tag$SELECT * FROM table$tag$`)
- PostgreSQL-style syntax for dates and intervals
- PostgreSQL operator precedence rules

## Query Performance Considerations

- JOINs use MongoDB's `$lookup` aggregation stage, which can be resource-intensive
- Complex GROUP BY operations translate to MongoDB aggregation pipelines
- Queries on non-indexed fields may be slow on large collections
- Array access operations can be expensive if arrays are large

## Next Pages

Explore detailed documentation for each SQL operation:

- [SELECT Queries](select.md)
- [INSERT Operations](insert.md)
- [UPDATE Operations](update.md)
- [DELETE Operations](delete.md)
- [Working with Nested Fields](nested-fields.md)
- [Working with Array Access](array-access.md)
- [Using JOINs](joins.md)
- [GROUP BY and Aggregation](group-by.md)