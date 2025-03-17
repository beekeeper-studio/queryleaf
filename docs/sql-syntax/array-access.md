# Working with Array Access

MongoDB documents can contain arrays, and QueryLeaf provides special syntax for accessing array elements. This page explains how to query and manipulate arrays in your SQL queries.

## Array Access Syntax

In QueryLeaf, you can access array elements using square bracket notation with zero-based indices:

```sql
field[index].subfield
```

## Querying Arrays

### Basic Array Element Access

```sql
-- Select array elements
SELECT _id, customer, items[0].name, items[0].price
FROM orders

-- Filter by array element value
SELECT _id, customer, total
FROM orders
WHERE items[0].name = 'Laptop'

-- Multiple array indices
SELECT _id, items[0].name AS first_item, items[1].name AS second_item
FROM orders
```

### Array Elements with Nested Fields

```sql
-- Nested fields within array elements
SELECT _id, items[0].product.name, items[0].product.category
FROM orders
WHERE items[0].product.manufacturer = 'Apple'
```

### Using WHERE with Array Elements

```sql
-- Comparison operations on array elements
SELECT _id, customer, total
FROM orders
WHERE items[0].price > 500

-- Multiple conditions on array elements
SELECT _id, customer
FROM orders
WHERE items[0].price > 100 AND items[0].quantity >= 2

-- Conditions on different array elements
SELECT _id, customer
FROM orders
WHERE items[0].category = 'Electronics' AND items[1].category = 'Accessories'
```

## Updating Array Elements

```sql
-- Update a specific array element
UPDATE orders
SET items[0].status = 'shipped'
WHERE _id = '60a6c5ef837f3d2d54c965f3'

-- Update nested field within array element
UPDATE orders
SET items[1].product.stock = 150
WHERE _id = '60a6c5ef837f3d2d54c965f3'
```

## Inserting Documents with Arrays

```sql
-- Insert with array of simple values
INSERT INTO users (name, email, tags) 
VALUES (
  'Bob Johnson', 
  'bob@example.com', 
  ['developer', 'nodejs', 'mongodb']
)

-- Insert with array of objects
INSERT INTO orders (customer, items) 
VALUES (
  'Alice Brown',
  [
    { "product": "Laptop", "price": 999.99, "quantity": 1 },
    { "product": "Mouse", "price": 24.99, "quantity": 2 }
  ]
)
```

## Translation to MongoDB

When working with arrays, QueryLeaf translates SQL to MongoDB using dot notation for array indices:

| SQL | MongoDB |
|-----|--------|
| `items[0].name` in SELECT | Projection with `'items.0.name': 1` |
| `items[0].price > 500` in WHERE | Filter with `'items.0.price': { $gt: 500 }` |
| `SET items[0].status = 'shipped'` | Update with `$set: {'items.0.status': 'shipped'}` |
| Array in INSERT | Array in insertOne/insertMany |

### Example Translation

SQL:
```sql
SELECT _id, customer, items[0].name, items[0].price
FROM orders
WHERE items[0].price > 500
```

MongoDB:
```javascript
db.collection('orders').find(
  { 'items.0.price': { $gt: 500 } },
  { _id: 1, customer: 1, 'items.0.name': 1, 'items.0.price': 1 }
)
```

## Limitations

- QueryLeaf does not currently support MongoDB's array operators like `$elemMatch` or `$all`
- Limited support for querying any element in an array (vs. a specific indexed element)
- No direct support for array update operators like `$push`, `$pull`, or `$addToSet`

## Performance Considerations

- Create indexes on frequently queried array fields: `db.orders.createIndex({'items.product': 1})`
- Be aware that querying and updating arrays with many elements can be less efficient
- Consider using specific array indices when possible for faster performance

## Best Practices

- Keep arrays at a reasonable size for optimal performance
- Consider how array data will be queried when designing your schema
- For complex array operations, consider using the MongoDB driver directly
- Use array access when you need to work with specific positions in arrays

## Related Pages

- [SELECT Queries](select.md)
- [UPDATE Operations](update.md)
- [INSERT Operations](insert.md)
- [Working with Nested Fields](nested-fields.md)