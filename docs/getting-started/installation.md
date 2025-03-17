# Installation

Getting started with QueryLeaf is straightforward. This guide will walk you through the installation process and prerequisites.

## Prerequisites

Before installing QueryLeaf, make sure you have:

- Node.js 16.x or higher
- npm or yarn package manager
- MongoDB (for running actual queries)
- Docker (optional, for running integration tests)

## Installing QueryLeaf

You can install QueryLeaf using npm or yarn:

=== "npm"
    ```bash
    npm install queryleaf
    ```

=== "yarn"
    ```bash
    yarn add queryleaf
    ```

## TypeScript Support

QueryLeaf is written in TypeScript and includes type definitions out of the box. You don't need to install any additional packages for TypeScript support.

## Peer Dependencies

QueryLeaf has the following peer dependencies:

- `mongodb`: The official MongoDB driver for Node.js
- `node-sql-parser`: Used to parse SQL statements

These dependencies will be installed automatically when you install QueryLeaf.

## Setting Up Your Project

Here's a basic project setup with QueryLeaf:

1. Create a new directory for your project:
   ```bash
   mkdir my-queryleaf-project
   cd my-queryleaf-project
   ```

2. Initialize a new npm project:
   ```bash
   npm init -y
   ```

3. Install QueryLeaf and MongoDB client:
   ```bash
   npm install queryleaf mongodb
   ```

4. Create a basic file structure:
   ```
   my-queryleaf-project/
   ├── node_modules/
   ├── src/
   │   └── index.js
   ├── package.json
   └── package-lock.json
   ```

5. Add a basic usage example in `src/index.js`:
   ```javascript
   const { MongoClient } = require('mongodb');
   const { QueryLeaf } = require('queryleaf');

   async function main() {
     // Connect to MongoDB
     const client = new MongoClient('mongodb://localhost:27017');
     await client.connect();
     console.log('Connected to MongoDB');

     // Create QueryLeaf instance
     const queryLeaf = new QueryLeaf(client, 'mydatabase');

     try {
       // Execute a query
       const results = await queryLeaf.execute('SELECT * FROM mycollection LIMIT 10');
       console.log('Query results:', results);
     } catch (error) {
       console.error('Error executing query:', error);
     } finally {
       // Close the connection
       await client.close();
       console.log('MongoDB connection closed');
     }
   }

   main().catch(console.error);
   ```

## Verifying Installation

To verify that QueryLeaf is installed correctly and working:

1. Make sure you have MongoDB running locally
2. Create a simple test script
3. Run the script and check for any errors

If everything is set up correctly, you should be able to execute SQL queries against your MongoDB database.

## Next Steps

Now that you have installed QueryLeaf, you can proceed to:

- [Quick Start Guide](quickstart.md): Learn the basics of using QueryLeaf
- [Core Concepts](../usage/core-concepts.md): Understand the architecture and principles
- [Examples](../usage/examples.md): See practical examples of using QueryLeaf