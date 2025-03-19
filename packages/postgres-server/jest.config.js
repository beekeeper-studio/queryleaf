/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    "**/tests/**/*.test.ts"
  ],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  // Resolve @queryleaf/lib from the monorepo
  moduleNameMapper: {
    '^@queryleaf/lib$': '<rootDir>/../lib/src/index.ts'
  },
  // Add options for path mapping
  modulePaths: ['<rootDir>/../'],
  // Tell Jest to transpile lib files too when importing
  transformIgnorePatterns: [
    '/node_modules/',
    // Don't ignore lib package
    '!/node_modules/@queryleaf/lib'
  ],
};