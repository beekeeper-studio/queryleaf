# QueryLeaf Monorepo Guidelines

This repository uses a monorepo structure with Yarn workspaces to manage multiple packages.

## Repository Structure

- `packages/lib`: Core library for SQL to MongoDB translation
- `packages/cli`: Command-line interface
- `packages/server`: REST API server

## Development Workflow

### Installation

```bash
yarn install
```

### Building

```bash
# Build all packages
yarn build

# Build individual packages
yarn build:lib
yarn build:cli
yarn build:server
```

### Testing

```bash
# Run all tests
yarn test

# Run tests for individual packages
yarn test:lib
yarn test:cli
yarn test:server

# Run specific test types for the lib package
yarn test:lib:unit
yarn test:lib:integration
```

### Code Quality

```bash
# Run TypeScript type checking
yarn typecheck

# Run linting
yarn lint
yarn lint:fix

# Run code formatting
yarn format
yarn format:check

# Run all validations (types, linting, tests, formatting)
yarn validate
```

## Adding new features

1. Determine which package(s) need to be modified
2. Make changes in the appropriate package(s)
3. Add tests in the package's `tests` directory
4. Run `yarn validate` to ensure everything passes
5. Submit a pull request

## Dependency Management

- Shared dev dependencies (TypeScript, ESLint, etc.) are in the root `package.json`
- Package-specific dependencies are in each package's `package.json`
- Use `yarn add <package> -W` to add a dependency to the root
- Use `yarn workspace @queryleaf/[package] add <dependency>` to add a dependency to a specific package

## Release Process

Each package is versioned independently but released together.

1. Update versions in each package's `package.json`
2. Build all packages: `yarn build`
3. Publish packages: 
   ```
   cd packages/lib && npm publish
   cd ../cli && npm publish
   cd ../server && npm publish
   ```

## Best Practices

1. Keep packages focused on a single responsibility
2. Share code through dependencies, not copy-paste
3. Ensure all code is properly tested
4. Maintain consistent coding style across packages using ESLint and Prettier
5. Document all public APIs