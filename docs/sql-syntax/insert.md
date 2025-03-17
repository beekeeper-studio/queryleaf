# INSERT Operations

The INSERT statement is used to add new documents to MongoDB collections. This page describes the syntax and features of INSERT operations in QueryLeaf.

## Basic Syntax

```sql
INSERT INTO collection (field1, field2, ...)
VALUES (value1, value2, ...), (value1, value2, ...), ...
```

## Examples

### Basic INSERT

```sql
-- Insert a single document
INSERT INTO users (name, email, age) 
VALUES ('John Doe', 'john@example.com', 30)

-- Insert multiple documents
INSERT INTO products (name, price, category) 
VALUES 
  ('Laptop', 999.99, 'Electronics'),
  ('Desk Chair', 199.99, 'Furniture'),
  ('Coffee Mug', 14.99, 'Kitchenware')
```

### Inserting with MongoDB-Specific Types

```sql
-- Insert with nested object
INSERT INTO users (name, email, address) 
VALUES (
  'Jane Smith', 
  'jane@example.com', 
  {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  }
)

-- Insert with array
INSERT INTO users (name, email, tags) 
VALUES (
  'Bob Johnson', 
  'bob@example.com', 
  ['developer', 'nodejs', 'mongodb']
)

-- Insert with both nested objects and arrays
INSERT INTO orders (customer, items, shipTo) 
VALUES (
  'Alice Brown',
  [
    { "product": "Laptop", "price": 999.99, "quantity": 1 },
    { "product": "Mouse", "price": 24.99, "quantity": 2 }
  ],
  {
    "address": "456 Oak St",
    "city": "Boston",
    "state": "MA",
    "zip": "02101"
  }
)
```

## NULL Values

```sql
-- Insert with NULL value
INSERT INTO users (name, email, phone) 
VALUES ('Chris Wilson', 'chris@example.com', NULL)
```

## Translation to MongoDB

When you run an INSERT query, QueryLeaf translates it to MongoDB operations:

| SQL Feature | MongoDB Equivalent |
|-------------|-------------------|
| INSERT INTO collection | db.collection() |
| VALUES | Document objects |
| Single row | insertOne() |
| Multiple rows | insertMany() |
| Nested objects | Embedded documents |
| Arrays | MongoDB arrays |

### Example Translation

SQL:
```sql
INSERT INTO users (name, email, address) 
VALUES (
  'Jane Smith', 
  'jane@example.com', 
  {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  }
)
```

MongoDB:
```javascript
db.collection('users').insertOne({
  name: 'Jane Smith',
  email: 'jane@example.com',
  address: {
    street: '123 Main St',
    city: 'New York',
    state: 'NY',
    zip: '10001'
  }
})
```

## Performance Considerations

- Use bulk inserts (multiple rows in a single INSERT statement) for better performance
- Consider adding appropriate indexes before bulk inserts
- Be aware of document size limits in MongoDB (16MB per document)
- For very large imports, consider using MongoDB's native tools or bulk operations

## Working with MongoDB ObjectIDs

MongoDB automatically generates an `_id` field for new documents if you don't specify one. You can also provide your own ObjectID value:

```sql
-- Let MongoDB generate an _id
INSERT INTO users (name, email) 
VALUES ('Jane Smith', 'jane@example.com')

-- Specify a string that will be converted to ObjectID (must be valid 24-character hex)
INSERT INTO users (_id, name, email) 
VALUES ('507f1f77bcf86cd799439011', 'Mark Davis', 'mark@example.com')

-- Use a custom string ID (will not be converted to ObjectID)
INSERT INTO users (_id, name, email) 
VALUES ('custom_id_1', 'Sarah Jones', 'sarah@example.com')
```

### How ObjectID Conversion Works

QueryLeaf automatically converts string values to MongoDB ObjectID objects when:

1. The field name is `_id`
2. The field name ends with `Id` (e.g., `userId`)
3. The field name ends with `Ids` (for arrays of IDs)
4. The string follows the MongoDB ObjectID format (24 hex characters)

For example, in this INSERT statement:

```sql
INSERT INTO orders (customerId, products) 
VALUES (
  '507f1f77bcf86cd799439011',
  [
    { productId: '609f1f77bcf86cd799439a22', quantity: 2 }
  ]
)
```

Both `customerId` and the `productId` inside the array will be automatically converted to MongoDB ObjectID objects.

## Related Pages

- [UPDATE Operations](update.md)
- [DELETE Operations](delete.md)
- [Working with Nested Fields](nested-fields.md)
- [Working with Array Access](array-access.md)