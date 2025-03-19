# Postgres Server Package

## Repository Structure
```
/packages/postgres-server/
├── bin/                     # Executable scripts
├── dist/                    # Compiled JavaScript files
├── examples/                # Example code demonstrating usage
├── src/                     # Source TypeScript files
│   ├── pg-server.ts         # Main PostgreSQL server implementation
│   └── protocol-handler.ts  # PostgreSQL wire protocol implementation
└── tests/                   # Test files
    ├── unit/                # Unit tests (mocks, no external dependencies)
    │   ├── auth-passthrough.test.ts
    │   ├── basic.test.ts
    │   ├── server.basic.test.ts
    │   └── server.test.ts
    ├── integration/         # Integration tests (real dependencies)
    │   ├── auth-passthrough.integration.test.ts
    │   ├── integration.test.ts
    │   ├── minimal-integration.test.ts
    │   ├── minimal.integration.test.ts
    │   └── protocol.test.ts
    └── utils/               # Shared test utilities
        ├── mongo-container.ts
        └── test-setup.ts
```

## Testing Conventions

### Test Organization
- **Unit Tests** (`tests/unit/`): Tests that use mocks and don't require external dependencies
  - Naming convention: `*.test.ts`
  - Focus on testing individual components in isolation
  - Use mocks for external dependencies like MongoDB

- **Integration Tests** (`tests/integration/`): Tests with real dependencies
  - Naming convention: `*.integration.test.ts`
  - Test interactions between components
  - May use real MongoDB instances or containers
  - Test actual PostgreSQL client connections

### Running Tests
```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

## Key Components

- **PostgresServer** (`pg-server.ts`): Main server implementation
  - Handles client connections
  - Routes messages to the protocol handler
  - Manages authentication and session state

- **ProtocolHandler** (`protocol-handler.ts`): Implements PostgreSQL wire protocol
  - Encodes/decodes protocol messages
  - Handles authentication flow
  - Supports authentication passthrough to MongoDB

## Authentication Passthrough

The server supports authenticating PostgreSQL client connections against a MongoDB backend, allowing PostgreSQL clients to connect using MongoDB credentials.