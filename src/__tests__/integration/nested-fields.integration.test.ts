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

  test('should project multiple nested fields simultaneously', async () => {
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
    
    // Act: Execute query with multiple nested field projections
    const squongo = testSetup.getSquongo();
    const sql = `
      SELECT 
        name, 
        contact.email, 
        contact.address.city, 
        contact.address.geo.lat,
        metadata.lastUpdated
      FROM contact_profiles
    `;
    
    const results = await squongo.execute(sql);
    console.log('Multiple nested fields results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify all nested fields are correctly projected
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('John Smith');
    expect(results[0].contact.email).toBe('john@example.com');
    expect(results[0].contact.address.city).toBe('Boston');
    expect(results[0].contact.address.geo.lat).toBe(42.3601);
    expect(results[0].metadata.lastUpdated).toBeDefined();
  });

  test('should filter by deeply nested field condition', async () => {
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
    
    // Act: Execute query filtering on a deeply nested field
    const squongo = testSetup.getSquongo();
    const sql = `
      SELECT name
      FROM contact_profiles
      WHERE contact.address.city = 'Boston'
    `;
    
    const results = await squongo.execute(sql);
    console.log('Nested filter results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify only Bostonians are returned
    expect(results).toHaveLength(2);
    const names = results.map((r: any) => r.name);
    expect(names).toContain('John Smith');
    expect(names).toContain('Bob Williams');
    expect(names).not.toContain('Alice Johnson');
  });

  test('should filter with comparison on deeply nested fields', async () => {
    // Arrange: Insert test data with nested numeric values
    const db = testSetup.getDb();
    await db.collection('products').insertMany([
      {
        name: 'Laptop',
        details: {
          specs: {
            performance: {
              cpu: { speed: 3.5, cores: 8 },
              memory: { size: 16, type: 'DDR4' }
            }
          },
          price: { 
            base: 1000,
            discounted: 899
          }
        }
      },
      {
        name: 'Desktop',
        details: {
          specs: {
            performance: {
              cpu: { speed: 4.2, cores: 12 },
              memory: { size: 32, type: 'DDR4' }
            }
          },
          price: { 
            base: 1500,
            discounted: 1399
          }
        }
      },
      {
        name: 'Tablet',
        details: {
          specs: {
            performance: {
              cpu: { speed: 2.8, cores: 6 },
              memory: { size: 8, type: 'LPDDR4' }
            }
          },
          price: { 
            base: 800,
            discounted: 749
          }
        }
      }
    ]);
    
    // Act: Execute query with comparison on deeply nested fields
    const squongo = testSetup.getSquongo();
    const sql = `
      SELECT name, details.specs.performance.cpu.speed as cpu_speed
      FROM products
      WHERE details.specs.performance.cpu.cores > 6
      AND details.price.discounted < 1400
    `;
    
    const results = await squongo.execute(sql);
    console.log('Nested comparison results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify only products matching deep nested criteria are returned
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Desktop');
    expect(results[0].cpu_speed).toBe(4.2);
    
    // Clean up products created for this test
    await db.collection('products').deleteMany({
      name: { $in: ['Laptop', 'Desktop', 'Tablet'] }
    });
  });
});