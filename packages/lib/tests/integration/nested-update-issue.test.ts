import { testSetup } from './test-setup';

describe('Nested Fields Update Issue', () => {
  beforeAll(async () => {
    await testSetup.init();
  }, 30000); // 30 second timeout for container startup
  
  afterAll(async () => {
    await testSetup.cleanup();
  });

  beforeEach(async () => {
    // Clean up test data
    const db = testSetup.getDb();
    await db.collection('customers').deleteMany({});
    
    // Insert test data with nested address object
    await db.collection('customers').insertOne({ 
      name: 'John Doe', 
      email: 'john@example.com',
      address: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001'
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    const db = testSetup.getDb();
    await db.collection('customers').deleteMany({});
  });
  

  test('should update a field within a nested object, not create a top-level field', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    const db = testSetup.getDb();
    
    // Act - Update the nested city field in the address
    const updateSql = `UPDATE customers SET address.city = 'Calgary' WHERE name = 'John Doe'`;
    
    // Execute the SQL via QueryLeaf
    await queryLeaf.execute(updateSql);
    
    // Get the result after the update
    const updatedCustomer = await db.collection('customers').findOne({ name: 'John Doe' });
    
    // Assert - should NOT have added a top-level 'city' field
    expect(updatedCustomer).not.toHaveProperty('city');
    
    // Should have updated the nested address.city field
    expect(updatedCustomer?.address?.city).toBe('Calgary');
    
    // Make sure other address fields remain intact
    expect(updatedCustomer?.address?.street).toBe('123 Main St');
    expect(updatedCustomer?.address?.zip).toBe('10001');
  });
  
  // With our new multi-level nested field support, this test should now pass
  test('should update a deeply nested field', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    const db = testSetup.getDb();
    
    // Insert a customer with a more deeply nested structure
    await db.collection('customers').insertOne({
      name: 'Bob Johnson',
      email: 'bob@example.com',
      shipping: {
        address: {
          street: '789 Oak St',
          city: 'Chicago',
          state: 'IL',
          country: {
            name: 'USA',
            code: 'US'
          }
        }
      }
    });
    
    // Act - Update a deeply nested field
    const updateSql = `
      UPDATE customers 
      SET shipping.address.country.name = 'Canada'
      WHERE name = 'Bob Johnson'
    `;
    
    // Execute the SQL via QueryLeaf
    await queryLeaf.execute(updateSql);
    
    // Get the result after the update
    const updatedCustomer = await db.collection('customers').findOne({ name: 'Bob Johnson' });
    
    // Assert - the deeply nested field should be updated
    expect(updatedCustomer?.shipping?.address?.country?.name).toBe('Canada');
    
    // The original code should still be there
    expect(updatedCustomer?.shipping?.address?.country?.code).toBe('US');
    
    // Other fields should remain intact
    expect(updatedCustomer?.shipping?.address?.city).toBe('Chicago');
    expect(updatedCustomer?.shipping?.address?.state).toBe('IL');
  });
  
  test('should update a field within an array element', async () => {
    // Arrange
    const queryLeaf = testSetup.getQueryLeaf();
    const db = testSetup.getDb();
    
    // Insert a customer with an array of addresses
    await db.collection('customers').insertOne({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      addresses: [
        {
          type: 'home',
          street: '123 Maple St',
          city: 'Toronto',
          postalCode: 'M5V 2N4',
          country: 'Canada'
        },
        {
          type: 'work',
          street: '456 Bay St',
          city: 'Toronto',
          postalCode: 'M5H 2S1',
          country: 'Canada'
        }
      ]
    });
    
    // Act - Update a field in the first array element
    const updateSql = `UPDATE customers SET addresses[0].postalCode = 'T1K 4B8' WHERE name = 'Alice Johnson'`;
    
    // Execute the SQL via QueryLeaf
    await queryLeaf.execute(updateSql);
    
    // Get the result after the update
    const updatedCustomer = await db.collection('customers').findOne({ name: 'Alice Johnson' });
    
    // Assert - the field in the array element should be updated
    expect(updatedCustomer?.addresses[0]?.postalCode).toBe('T1K 4B8');
    
    // Make sure other fields in the array element remain intact
    expect(updatedCustomer?.addresses[0]?.type).toBe('home');
    expect(updatedCustomer?.addresses[0]?.street).toBe('123 Maple St');
    expect(updatedCustomer?.addresses[0]?.city).toBe('Toronto');
    
    // Make sure the second array element is unchanged
    expect(updatedCustomer?.addresses[1]?.postalCode).toBe('M5H 2S1');
    
    // Make sure no top-level fields were created by mistake
    expect(updatedCustomer).not.toHaveProperty('postalCode');
  });
});
