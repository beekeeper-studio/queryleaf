/**
 * Example demonstrating the use of the DummyQueryLeaf for testing
 */

import { DummyQueryLeaf } from '../index';

async function main() {
  console.log('Creating DummyQueryLeaf for testing');
  const queryLeaf = new DummyQueryLeaf('test_database');
  
  console.log('Executing SELECT statement');
  await queryLeaf.execute('SELECT * FROM users WHERE age > 21');
  
  console.log('Executing INSERT statement');
  await queryLeaf.execute(`
    INSERT INTO products (name, price, category) 
    VALUES ('Laptop', 1299.99, 'Electronics')
  `);
  
  console.log('Executing UPDATE statement');
  await queryLeaf.execute(`
    UPDATE users 
    SET status = 'active', last_login = NOW() 
    WHERE user_id = '507f1f77bcf86cd799439011'
  `);
  
  console.log('Executing DELETE statement');
  await queryLeaf.execute(`
    DELETE FROM orders 
    WHERE status = 'cancelled' AND created_at < '2023-01-01'
  `);
  
  console.log('Executing GROUP BY with aggregation');
  await queryLeaf.execute(`
    SELECT category, AVG(price) as avg_price, COUNT(*) as product_count 
    FROM products 
    GROUP BY category
    HAVING AVG(price) > 100
  `);
  
  console.log('Executing JOIN');
  await queryLeaf.execute(`
    SELECT o.order_id, u.name, o.total 
    FROM orders o 
    JOIN users u ON o.user_id = u.user_id 
    WHERE o.status = 'shipped'
  `);
  
  console.log('Done with testing');
}

// Run the example
main().catch(error => {
  console.error('Error in example:', error);
});