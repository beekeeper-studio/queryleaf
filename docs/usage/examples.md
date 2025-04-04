# Usage Examples

This page provides practical examples of using QueryLeaf in various scenarios.

## Basic Query Examples

### Simple SELECT Query

```typescript
import { MongoClient } from 'mongodb';
import { QueryLeaf } from '@queryleaf/lib';

async function runBasicQuery() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  try {
    const queryLeaf = new QueryLeaf(client, 'mydatabase');
    
    // Simple SELECT query
    const users = await queryLeaf.execute(
      'SELECT name, email FROM users WHERE age > 21 ORDER BY name'
    );
    
    console.log('Users over 21:', users);
  } finally {
    await client.close();
  }
}
```

### INSERT Example

```typescript
// Insert a new document
await queryLeaf.execute(`
  INSERT INTO products (name, price, category, inStock) 
  VALUES ('Wireless Headphones', 89.99, 'Electronics', true)
`);
```

### UPDATE Example

```typescript
// Update multiple documents
await queryLeaf.execute(`
  UPDATE users 
  SET status = 'active', lastLogin = '2023-06-15' 
  WHERE verified = true
`);
```

### DELETE Example

```typescript
// Delete documents based on condition
await queryLeaf.execute(`
  DELETE FROM sessions 
  WHERE expiry < '2023-01-01'
`);
```

## Advanced Query Examples

### Nested Field Access

```typescript
// Query documents with nested fields
const usersInNY = await queryLeaf.execute(`
  SELECT name, email, address.city, address.zip 
  FROM users 
  WHERE address.state = 'NY'
`);
```

### Using Cursors for Large Result Sets

```typescript
// Use cursor for memory-efficient processing of large result sets
// Optionally specify a batch size to control how many documents are fetched at once
const cursor = await queryLeaf.executeCursor(`
  SELECT _id, customer, total, items
  FROM orders
  WHERE status = 'completed'
`, { batchSize: 100 }); // Set batch size to 100 documents per batch

try {
  // Process one document at a time without loading everything in memory
  let totalRevenue = 0;
  await cursor.forEach(order => {
    // Process each order individually
    totalRevenue += order.total;
    
    // Access and process nested data
    order.items.forEach(item => {
      // Process each item in the order
      console.log(`Order ${order._id}: ${item.quantity}x ${item.name}`);
    });
  });
  
  console.log(`Total revenue: $${totalRevenue}`);
} finally {
  // Always close the cursor when done
  await cursor.close();
}
```

### Array Element Access

```typescript
// Query documents with array elements
const ordersWithLaptops = await queryLeaf.execute(`
  SELECT _id, customer, total 
  FROM orders 
  WHERE items[0].name = 'Laptop'
`);

// Access multiple array elements
const orderDetails = await queryLeaf.execute(`
  SELECT _id, customer, items[0].name as first_item, items[1].name as second_item 
  FROM orders
`);
```

### JOIN Example

```typescript
// Join users and orders collections
const userOrders = await queryLeaf.execute(`
  SELECT u.name, u.email, o._id as order_id, o.total 
  FROM users u 
  JOIN orders o ON u._id = o.userId 
  WHERE o.status = 'shipped'
`);
```

### GROUP BY Example

```typescript
// Group by with aggregation
const orderStats = await queryLeaf.execute(`
  SELECT 
    status, 
    COUNT(*) as count, 
    SUM(total) as total_value,
    AVG(total) as average_value,
    MIN(total) as min_value,
    MAX(total) as max_value
  FROM orders 
  GROUP BY status
`);
```

## Real-World Examples

### User Dashboard Data

```typescript
// Get data for a user dashboard
async function getUserDashboardData(userId) {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  try {
    const queryLeaf = new QueryLeaf(client, 'mydatabase');
    
    // Get user profile
    const [user] = await queryLeaf.execute(`
      SELECT name, email, profile.avatar, profile.bio 
      FROM users 
      WHERE _id = '${userId}'
    `);
    
    // Get user's recent orders
    const recentOrders = await queryLeaf.execute(`
      SELECT _id, createdAt, total, status 
      FROM orders 
      WHERE userId = '${userId}' 
      ORDER BY createdAt DESC 
      LIMIT 5
    `);
    
    // Get user's order statistics
    const [orderStats] = await queryLeaf.execute(`
      SELECT 
        COUNT(*) as totalOrders, 
        SUM(total) as totalSpent,
        AVG(total) as averageOrderValue
      FROM orders 
      WHERE userId = '${userId}'
    `);
    
    return {
      user,
      recentOrders,
      orderStats
    };
  } finally {
    await client.close();
  }
}
```

### Product Catalog with Filtering and Cursor-Based Pagination

```typescript
// Product catalog with filtering and cursor-based pagination
async function getProductCatalog(filters = {}, useCursor = false) {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  try {
    const queryLeaf = new QueryLeaf(client, 'store');
    
    // Build WHERE clause based on filters
    const whereClauses = [];
    
    if (filters.category) {
      whereClauses.push(`category = '${filters.category}'`);
    }
    
    if (filters.minPrice) {
      whereClauses.push(`price >= ${filters.minPrice}`);
    }
    
    if (filters.maxPrice) {
      whereClauses.push(`price <= ${filters.maxPrice}`);
    }
    
    if (filters.inStock) {
      whereClauses.push(`stock > 0`);
    }
    
    // Construct the query
    let query = `
      SELECT _id, name, price, category, description, stock, rating
      FROM products
    `;
    
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    // Add sorting
    query += ` ORDER BY ${filters.sortBy || 'name'} ${filters.sortOrder || 'ASC'}`;
    
    // Add pagination
    if (filters.limit) {
      query += ` LIMIT ${filters.limit}`;
    }
    
    if (filters.offset) {
      query += ` OFFSET ${filters.offset}`;
    }
    
    // Execute query with or without cursor based on preference
    if (useCursor) {
      // Return a cursor for client-side pagination or streaming
      return await queryLeaf.executeCursor(query);
    } else {
      // Return all results at once (traditional approach)
      return await queryLeaf.execute(query);
    }
  } catch (error) {
    console.error('Error fetching product catalog:', error);
    throw error;
  } finally {
    if (!useCursor) {
      // If we returned a cursor, the caller is responsible for closing the client
      // after they are done with the cursor
      await client.close();
    }
  }
}

// Example of using the product catalog with cursor
async function streamProductCatalog() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  let cursor = null;
  try {
    const queryLeaf = new QueryLeaf(client, 'store');
    // Get a cursor for large result set
    cursor = await getProductCatalog({ category: 'Electronics', inStock: true }, true);
    
    // Stream products to client one by one
    console.log('Streaming products:');
    await cursor.forEach(product => {
      console.log(`- ${product.name}: $${product.price} (${product.stock} in stock)`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close cursor if we have one
    if (cursor) await cursor.close();
    // Close client connection
    await client.close();
  }
}
```

### Analytics Report

```typescript
// Generate a sales analytics report
async function generateSalesReport(startDate, endDate) {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  try {
    const queryLeaf = new QueryLeaf(client, 'store');
    
    // Sales by category
    const categoryStats = await queryLeaf.execute(`
      SELECT 
        p.category, 
        COUNT(*) as orderCount, 
        SUM(o_items.quantity) as unitsSold,
        SUM(o_items.quantity * o_items.price) as revenue
      FROM orders o
      JOIN order_items o_items ON o._id = o_items.orderId
      JOIN products p ON o_items.productId = p._id
      WHERE o.createdAt >= '${startDate}' AND o.createdAt <= '${endDate}'
      GROUP BY p.category
      ORDER BY revenue DESC
    `);
    
    // Daily sales trend
    const dailySales = await queryLeaf.execute(`
      SELECT 
        DATE(createdAt) as date, 
        COUNT(*) as orderCount,
        SUM(total) as dailyRevenue
      FROM orders
      WHERE createdAt >= '${startDate}' AND createdAt <= '${endDate}'
      GROUP BY DATE(createdAt)
      ORDER BY date
    `);
    
    // Top selling products
    const topProducts = await queryLeaf.execute(`
      SELECT 
        p.name, 
        p.category,
        SUM(o_items.quantity) as unitsSold,
        SUM(o_items.quantity * o_items.price) as revenue
      FROM order_items o_items
      JOIN products p ON o_items.productId = p._id
      JOIN orders o ON o_items.orderId = o._id
      WHERE o.createdAt >= '${startDate}' AND o.createdAt <= '${endDate}'
      GROUP BY p._id, p.name, p.category
      ORDER BY unitsSold DESC
      LIMIT 10
    `);
    
    return {
      categoryStats,
      dailySales,
      topProducts
    };
  } finally {
    await client.close();
  }
}
```

## Error Handling Examples

```typescript
async function executeWithErrorHandling(sqlQuery) {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    const queryLeaf = new QueryLeaf(client, 'mydatabase');
    
    return await queryLeaf.execute(sqlQuery);
  } catch (error) {
    // Handle different types of errors
    if (error.message.includes('SQL parsing error')) {
      console.error('SQL syntax error:', error.message);
      // Handle syntax errors
    } else if (error.name === 'MongoServerError') {
      console.error('MongoDB error:', error.message);
      // Handle MongoDB specific errors
      if (error.code === 11000) {
        console.error('Duplicate key error');
        // Handle duplicate key errors
      }
    } else {
      console.error('Unexpected error:', error);
    }
    
    throw error; // Re-throw or return a default value
  } finally {
    await client.close();
  }
}
```

## More Examples

For more examples, refer to the [examples directory](https://github.com/beekeeper-studio/queryleaf/tree/main/src/examples) in the QueryLeaf repository.