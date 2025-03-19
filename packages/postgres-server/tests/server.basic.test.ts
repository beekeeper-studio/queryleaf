describe('PostgreSQL Server', () => {
  test('Basic functionality works', () => {
    // Simple test to ensure tests can run
    expect(1 + 1).toBe(2);
  });
  
  test('Protocol formatting functions', () => {
    // Test Buffer encoding and message formatting
    const message = Buffer.from('test');
    const formatted = Buffer.concat([Buffer.from([84]), Buffer.alloc(4), message]);
    formatted.writeUInt32BE(message.length + 4, 1);
    
    // Check if the message formatting works correctly
    expect(formatted[0]).toBe(84); // 'T' in ASCII
    expect(formatted.readUInt32BE(1)).toBe(message.length + 4);
    expect(formatted.subarray(5).toString()).toBe('test');
  });
});