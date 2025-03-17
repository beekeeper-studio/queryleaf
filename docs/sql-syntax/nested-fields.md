# Working with Nested Fields

MongoDB documents can contain nested fields (embedded documents), and QueryLeaf provides SQL syntax for working with these structures. This page explains how to query, update, and insert data with nested fields.

## Nested Field Syntax

In QueryLeaf, you can access nested fields using dot notation:

```sql
collection.field.subfield
```

## Querying Nested Fields

### SELECT with Nested Fields

```sql
-- Select nested fields
SELECT name, address.city, address.state
FROM users

-- Filter based on nested fields
SELECT name, email
FROM users
WHERE address.city = 'New York'

-- Multiple nested levels
SELECT name, shipping.address.street, shipping.address.city
FROM orders
WHERE shipping.address.country = 'USA'
```

### WHERE Conditions with Nested Fields

```sql
-- Simple equality with nested field
SELECT * FROM users WHERE profile.language = 'en'

-- Comparison operators
SELECT * FROM products WHERE details.weight > 5

-- Multiple nested field conditions
SELECT * FROM users
WHERE address.city = 'San Francisco' AND profile.verified = true
```

## Updating Nested Fields

```sql
-- Update a single nested field
UPDATE users
SET address.city = 'Chicago'
WHERE _id = '507f1f77bcf86cd799439011'

-- Update multiple nested fields
UPDATE users
SET 
  address.street = '123 Oak St',
  address.city = 'Boston',
  address.state = 'MA',
  address.zip = '02101'
WHERE email = 'john@example.com'

-- Update deeply nested fields
UPDATE orders
SET customer.shipping.address.zipCode = '94105'
WHERE _id = '60a6c5ef837f3d2d54c965f3'
```

## Inserting Documents with Nested Fields

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

-- Insert with multiple nested objects
INSERT INTO orders (customer, shipping, billing) 
VALUES (
  'Bob Johnson',
  {
    "method": "Express",
    "address": {
      "street": "456 Pine St",
      "city": "Seattle",
      "state": "WA",
      "zip": "98101"
    }
  },
  {
    "method": "Credit Card",
    "address": {
      "street": "456 Pine St",
      "city": "Seattle",
      "state": "WA",
      "zip": "98101"
    }
  }
)
```

## Translation to MongoDB

When working with nested fields, QueryLeaf translates SQL to MongoDB using dot notation:

| SQL | MongoDB |
|-----|--------|
| `address.city` in SELECT | Projection with `'address.city': 1` |
| `address.city = 'New York'` in WHERE | Filter with `'address.city': 'New York'` |
| `SET address.city = 'Chicago'` | Update with `$set: {'address.city': 'Chicago'}` |
| Nested object in INSERT | Embedded document in insertOne/insertMany |

### Example Translation

SQL:
```sql
SELECT name, address.city, address.state
FROM users
WHERE address.country = 'USA'
```

MongoDB:
```javascript
db.collection('users').find(
  { 'address.country': 'USA' },
  { name: 1, 'address.city': 1, 'address.state': 1 }
)
```

## Performance Considerations

- Create indexes on frequently queried nested fields: `db.users.createIndex({'address.city': 1})`
- Be aware that updating deeply nested fields can be less efficient than updating top-level fields
- Consider denormalizing data if you frequently query specific nested fields

## Best Practices

- Use nested fields for data that logically belongs together (e.g., address components)
- Keep nesting depth reasonable (2-3 levels) for optimal performance
- Consider MongoDB's document size limits (16MB) when working with deeply nested structures
- For complex nested structures that need independent querying, consider using separate collections with references

## Related Pages

- [SELECT Queries](select.md)
- [UPDATE Operations](update.md)
- [INSERT Operations](insert.md)
- [Working with Array Access](array-access.md)