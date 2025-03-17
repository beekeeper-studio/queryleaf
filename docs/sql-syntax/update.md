# UPDATE Operations

The UPDATE statement is used to modify existing documents in MongoDB collections. This page describes the syntax and features of UPDATE operations in QueryLeaf.

## Basic Syntax

```sql
UPDATE collection
SET field1 = value1, field2 = value2, ...
[WHERE conditions]
```

## Examples

### Basic UPDATE

```sql
-- Update a single field for all documents
UPDATE users
SET status = 'active'

-- Update with WHERE condition
UPDATE products
SET price = 1299.99
WHERE name = 'Premium Laptop'

-- Update multiple fields
UPDATE users
SET 
  status = 'inactive',
  lastUpdated = '2023-06-15'
WHERE lastLogin < '2023-01-01'
```

### Updating Nested Fields

```sql
-- Update nested field
UPDATE users
SET address.city = 'San Francisco', address.state = 'CA'
WHERE _id = '507f1f77bcf86cd799439011'

-- Update deeply nested field
UPDATE orders
SET shipTo.address.zipCode = '94105'
WHERE _id = '60a6c5ef837f3d2d54c965f3'
```

### Updating Array Elements

```sql
-- Update specific array element
UPDATE orders
SET items[0].status = 'shipped'
WHERE _id = '60a6c5ef837f3d2d54c965f3'

-- Update array element based on condition
UPDATE inventory
SET items[0].quantity = 100
WHERE items[0].sku = 'LAPTOP-001'
```

## NULL Values

```sql
-- Set field to NULL
UPDATE users
SET phone = NULL
WHERE _id = '507f1f77bcf86cd799439011'
```

## Translation to MongoDB

When you run an UPDATE query, QueryLeaf translates it to MongoDB operations:

| SQL Feature | MongoDB Equivalent |
|-------------|-------------------|
| UPDATE collection | db.collection() |
| SET field = value | $set operator |
| WHERE | Query filter object |
| Nested fields | Dot notation in $set |
| Array elements | Dot notation with indices |

### Example Translation

SQL:
```sql
UPDATE users
SET status = 'inactive', lastUpdated = '2023-06-15'
WHERE lastLogin < '2023-01-01'
```

MongoDB:
```javascript
db.collection('users').updateMany(
  { lastLogin: { $lt: '2023-01-01' } },
  { $set: { status: 'inactive', lastUpdated: '2023-06-15' } }
)
```

## Performance Considerations

- Updates with specific `_id` values are the most efficient
- Add appropriate indexes for fields used in WHERE conditions
- Be mindful of update operations on large collections
- Consider using the MongoDB driver directly for complex update operations

## Working with MongoDB ObjectIDs

When updating documents using ObjectID fields:

```sql
-- Update by _id (string will be converted to ObjectID)
UPDATE users
SET status = 'verified'
WHERE _id = '507f1f77bcf86cd799439011'

-- Update by reference ID field
UPDATE orders
SET status = 'shipped'
WHERE customerId = '507f1f77bcf86cd799439011'
```

QueryLeaf automatically converts the string value in the WHERE clause to a MongoDB ObjectID object when the field name is `_id` or ends with `Id` and the string is a valid 24-character hexadecimal string.

## Limitations

- Limited support for complex update operations (e.g., $inc, $push)
- No direct support for MongoDB's array update operators like $push, $pull
- No direct support for positional updates in arrays

## Related Pages

- [INSERT Operations](insert.md)
- [DELETE Operations](delete.md)
- [Working with Nested Fields](nested-fields.md)
- [Working with Array Access](array-access.md)