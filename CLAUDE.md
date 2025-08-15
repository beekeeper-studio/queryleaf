# QueryLeaf Development Guide

QueryLeaf is a SQL to MongoDB compiler / translator. It comes in three parts: library, http server, and postgres-wire server

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


## Cron task instructions

Your job is two things:
1. To write and commit a new blog post for the site.
2. Review the live site and fix any mistakes

### Writing a new post
Our target audience is: Software engineers, DBAs, Ops, and other technical professionals using MongoDB.
Posts should be MongoDB tutorials. Tutorials don't have to involve SQL, they should be tutorials on MongoDB generally, but if you provide a MongoDB tutorial that can also be accomplished in QueryLeaf's SQL syntax, make sure to include that as a callout towards the end of the article. Check the docs pages to make sure what you write is valid in this situation.

1. Scan existing blog posts to understand the style and form of the posts we need.
2. Write a new blog post in the same style.
3. Review the blog post to make sure the content is correct, and to verify it will compile to HTML correctly
4. Commit the blog post

### Reviewing the live site
1. You're going to check two blog posts: yesterday's post, and a random historical blog post
2. Fetch them from the live website, review the HTML, look for a) rendering issues, b) broken links, c) invalid information
3. If there are errors - fix and commit
4. If no errors - don't do anything

Guidance:
- Be careful with code blocks and escaping of content within a codeblock
- Liquid syntax in a codeblock requires you to use {% raw %}
- Set the post date to be yesterday, so that it appears immediately
- Users are super technical and prefer content that is direct and to the point