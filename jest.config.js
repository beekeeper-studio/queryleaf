module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 30000, // 30 seconds timeout for tests involving containers
  forceExit: true, // Force Jest to exit after tests complete
  detectOpenHandles: true // Helps identify what's keeping Jest open
};