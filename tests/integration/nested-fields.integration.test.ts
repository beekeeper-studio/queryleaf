import { ObjectId } from 'mongodb';
import { testSetup } from './test-setup';

describe('Nested Fields Integration Tests', () => {
  beforeAll(async () => {
    await testSetup.init();
  }, 30000); // 30 second timeout for container startup
  
  afterAll(async () => {
    await testSetup.cleanup();
  });
  
  beforeEach(async () => {
    // Add test data for nested fields
    const db = testSetup.getDb();
    await db.collection('contact_profiles').deleteMany({});
  });
  
  afterEach(async () => {
    // Clean up test data
    const db = testSetup.getDb();
    await db.collection('contact_profiles').deleteMany({});
  });

  test('should return data with nested fields', async () => {
    // Arrange: Insert test data with multiple nested fields
    const db = testSetup.getDb();
    await db.collection('contact_profiles').insertOne({
      _id: new ObjectId(),
      name: 'John Smith',
      contact: {
        email: 'john@example.com',
        phone: '555-1234',
        address: {
          street: '123 Main St',
          city: 'Boston',
          state: 'MA',
          zip: '02108',
          geo: {
            lat: 42.3601,
            lng: -71.0589
          }
        }
      },
      metadata: {
        created: new Date('2023-01-01'),
        lastUpdated: new Date('2023-02-15'),
        tags: ['customer', 'premium']
      }
    });
    
    // Act: Execute a simpler query with a star projection to verify the data exists
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `
      SELECT *
      FROM contact_profiles
      WHERE name = 'John Smith'
    `;
    
    const results = await queryLeaf.execute(sql);
    console.log('Nested fields results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify we can access the data
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('John Smith');
    expect(results[0].contact).toBeDefined();
    expect(results[0].metadata).toBeDefined();
  });

  test('should filter by nested field condition', async () => {
    // Arrange: Insert multiple documents with nested fields for filtering
    const db = testSetup.getDb();
    await db.collection('contact_profiles').insertMany([
      {
        name: 'John Smith',
        contact: {
          address: {
            city: 'Boston',
            geo: { lat: 42.3601, lng: -71.0589 }
          }
        }
      },
      {
        name: 'Alice Johnson',
        contact: {
          address: {
            city: 'New York',
            geo: { lat: 40.7128, lng: -74.0060 }
          }
        }
      },
      {
        name: 'Bob Williams',
        contact: {
          address: {
            city: 'Boston',
            geo: { lat: 42.3601, lng: -70.9999 }
          }
        }
      }
    ]);
    
    // Act: Execute query filtering on a nested field
    const queryLeaf = testSetup.getQueryLeaf();
    
    // Use direct MongoDB-style dot notation for nested fields
    const sql = `
      SELECT name
      FROM contact_profiles
      WHERE contact.address.city = 'Boston'
    `;
    
    console.log('Running nested field query:', sql);
    
    // Try direct MongoDB query to verify data exists
    const directQueryResults = await testSetup.getDb().collection('contact_profiles')
      .find({'contact.address.city': 'Boston'})
      .toArray();
    console.log('Direct MongoDB query results:', JSON.stringify(directQueryResults, null, 2));
    
    const results = await queryLeaf.execute(sql);
    console.log('Nested filter results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify only Bostonians are returned
    expect(results).toHaveLength(2);
    const names = results.map((r: any) => r.name);
    expect(names).toContain('John Smith');
    expect(names).toContain('Bob Williams');
    expect(names).not.toContain('Alice Johnson');
  });

  test('should filter with comparison on nested fields', async () => {
    // Arrange: Insert test data with nested numeric values
    const db = testSetup.getDb();
    await db.collection('products').insertMany([
      {
        name: 'Laptop',
        details: {
          specs: {
            cores: 8
          },
          price: 899
        }
      },
      {
        name: 'Desktop',
        details: {
          specs: {
            cores: 12
          },
          price: 1399
        }
      },
      {
        name: 'Tablet',
        details: {
          specs: {
            cores: 6
          },
          price: 749
        }
      }
    ]);
    
    // Act: Execute query with comparison on nested fields
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `
      SELECT name
      FROM products
      WHERE details.specs.cores > 6
      AND details.price < 1400
    `;
    
    const results = await queryLeaf.execute(sql);
    console.log('Nested comparison results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify only products matching nested criteria are returned
    expect(results).toHaveLength(2);
    const productNames = results.map((r: any) => r.name);
    expect(productNames).toContain('Laptop');
    expect(productNames).toContain('Desktop');
    expect(productNames).not.toContain('Tablet');
    
    // Clean up products created for this test
    await db.collection('products').deleteMany({
      name: { $in: ['Laptop', 'Desktop', 'Tablet'] }
    });
  });
});