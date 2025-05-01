# QueryLeaf Development Guide

QueryLeaf is a SQL to MongoDB compiler / translator.

## Build & Test Commands
- Full build: `yarn build`
- Typecheck: `yarn typecheck`
- Lint: `yarn lint` (fix: `yarn lint:fix`)
- Format: `yarn format` (check: `yarn format:check`)
- Run all tests: `yarn test`
- Run individual package tests: `yarn test:lib`, `yarn test:cli`, `yarn test:server`, `yarn test:pg-server`
- Run single test: `cd packages/[package] && yarn yarn -t "test name"` or `yarn jest path/to/test.test.ts -t "test name"`
- Integration tests: `yarn test:lib:integration` (requires Docker)
- Documentation: `yarn docs:serve` (dev), `yarn docs:build` (build)

## Code Style Guidelines
- We use YARN, not NPM
- GitHub actions is used for builds, see workflows in the .github folder.
- TypeScript with strict typing; avoid `any` when possible
- Single quotes, trailing commas, 2-space indentation, 100 char line limit
- Prefix unused variables with underscore (e.g., `_unused`)
- Monorepo structure with packages: lib, cli, server, postgres-server
- Descriptive variable/function names in camelCase
- Error handling with proper try/catch blocks and meaningful error messages
- Use async/await for asynchronous code
- Follow existing patterns for similar functionality
- Tests should cover both unit and integration cases
