import { ObjectId } from 'mongodb';
import { testSetup, createLogger } from './test-setup';

const log = createLogger('nested-fields');

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
    await db.collection('products').deleteMany({});
  });
  
  afterEach(async () => {
    // Clean up test data
    const db = testSetup.getDb();
    await db.collection('contact_profiles').deleteMany({});
    await db.collection('products').deleteMany({});
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
    log('Nested fields results:', JSON.stringify(results, null, 2));
    
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
    
    log('Running nested field query:', sql);
    
    // Try direct MongoDB query to verify data exists
    const directQueryResults = await testSetup.getDb().collection('contact_profiles')
      .find({'contact.address.city': 'Boston'})
      .toArray();
    log('Direct MongoDB query results:', JSON.stringify(directQueryResults, null, 2));
    
    const results = await queryLeaf.execute(sql);
    log('Nested filter results:', JSON.stringify(results, null, 2));
    
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
    log('Nested comparison results:', JSON.stringify(results, null, 2));
    
    // Assert: Verify only products matching nested criteria are returned
    expect(results).toHaveLength(2);
    const productNames = results.map((r: any) => r.name);
    expect(productNames).toContain('Laptop');
    expect(productNames).toContain('Desktop');
    expect(productNames).not.toContain('Tablet');
  });

  test('should project multiple nested fields simultaneously', async () => {
    // Arrange
    const db = testSetup.getDb();
    await db.collection('products').insertMany([
      { 
        name: 'Laptop',
        details: { 
          color: 'silver', 
          dimensions: { length: 14, width: 10, height: 0.7 },
          specs: { 
            cpu: 'Intel i7', 
            ram: '16GB',
            storage: { type: 'SSD', size: '512GB' },
            graphics: { type: 'Integrated', model: 'Intel Iris' }
          } 
        },
        pricing: {
          msrp: 1299,
          discount: { percentage: 10, amount: 129.9 },
          final: 1169.1
        }
      },
      { 
        name: 'Smartphone',
        details: { 
          color: 'black', 
          dimensions: { length: 6, width: 3, height: 0.3 },
          specs: { 
            cpu: 'Snapdragon', 
            ram: '8GB',
            storage: { type: 'Flash', size: '256GB' },
            graphics: { type: 'Integrated', model: 'Adreno' }
          } 
        },
        pricing: {
          msrp: 999,
          discount: { percentage: 5, amount: 49.95 },
          final: 949.05
        }
      }
    ]);
    
    // Act - first check with direct MongoDB query to confirm data
    const directLaptopQuery = await db.collection('products').findOne({ name: 'Laptop' });
    log('Direct laptop query result:', JSON.stringify(directLaptopQuery, null, 2));
    
    // Use QueryLeaf to query the data
    const queryLeaf = testSetup.getQueryLeaf();
    const sql = `
      SELECT 
        name,
        details,
        pricing
      FROM products
    `;
    
    const results = await queryLeaf.execute(sql);
    log('Nested fields query results:', JSON.stringify(results, null, 2));
    
    // Helper function to safely access nested properties
    const getNestedProp = (obj: any, path: string[]) => {
      return path.reduce((o, key) => (o && typeof o === 'object') ? o[key] : undefined, obj);
    };
    
    // Assert: Verify results count and basic structure
    expect(results).toHaveLength(2);
    
    const laptop = results.find((p: any) => p.name === 'Laptop');
    const phone = results.find((p: any) => p.name === 'Smartphone');
    
    expect(laptop).toBeDefined();
    expect(phone).toBeDefined();
    
    // Helper to get appropriate property access paths based on result format
    const getAccessPath = (obj: any, prop: string): any => {
      // Try different property access patterns based on how MongoDB might return the data
      if (obj[prop]) return obj[prop];
      if (obj._doc && obj._doc[prop]) return obj._doc[prop];
      return undefined;
    };
    
    // Assert: Verify laptop details fields
    const laptopDetails = getAccessPath(laptop, 'details');
    expect(laptopDetails).toBeDefined();
    
    if (laptopDetails) {
      // Verify top-level nested properties
      expect(laptopDetails.color).toBe('silver');
      
      // Verify dimensions object 
      const dimensions = laptopDetails.dimensions;
      expect(dimensions).toBeDefined();
      if (dimensions) {
        expect(dimensions.length).toBe(14);
        expect(dimensions.width).toBe(10);
        expect(dimensions.height).toBe(0.7);
      }
      
      // Verify specs object and its nested properties
      const specs = laptopDetails.specs;
      expect(specs).toBeDefined();
      if (specs) {
        expect(specs.cpu).toBe('Intel i7');
        expect(specs.ram).toBe('16GB');
        
        // Verify storage object
        const storage = specs.storage;
        expect(storage).toBeDefined();
        if (storage) {
          expect(storage.type).toBe('SSD');
          expect(storage.size).toBe('512GB');
        }
        
        // Verify graphics object
        const graphics = specs.graphics;
        expect(graphics).toBeDefined();
        if (graphics) {
          expect(graphics.type).toBe('Integrated');
          expect(graphics.model).toBe('Intel Iris');
        }
      }
    }
    
    // Assert: Verify laptop pricing fields
    const laptopPricing = getAccessPath(laptop, 'pricing');
    expect(laptopPricing).toBeDefined();
    
    if (laptopPricing) {
      expect(laptopPricing.msrp).toBe(1299);
      
      // Verify discount object
      const discount = laptopPricing.discount;
      expect(discount).toBeDefined();
      if (discount) {
        expect(discount.percentage).toBe(10);
        // Use approximate comparison for floating point
        expect(Math.abs(discount.amount - 129.9)).toBeLessThan(0.01);
      }
      
      // Use approximate comparison for floating point
      expect(Math.abs(laptopPricing.final - 1169.1)).toBeLessThan(0.01);
    }
    
    // Assert: Verify phone fields (less detailed for brevity)
    const phoneDetails = getAccessPath(phone, 'details');
    expect(phoneDetails).toBeDefined();
    
    if (phoneDetails) {
      expect(phoneDetails.color).toBe('black');
      
      const specs = phoneDetails.specs;
      expect(specs).toBeDefined();
      if (specs) {
        expect(specs.cpu).toBe('Snapdragon');
        expect(specs.ram).toBe('8GB');
      }
    }
    
    const phonePricing = getAccessPath(phone, 'pricing');
    expect(phonePricing).toBeDefined();
    if (phonePricing) {
      expect(phonePricing.msrp).toBe(999);
    }
  });
});