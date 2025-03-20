#!/usr/bin/env node

import { MongoClient } from 'mongodb';
import { QueryLeaf } from '@queryleaf/lib';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('uri', {
    describe: 'MongoDB connection URI',
    default: 'mongodb://localhost:27017',
    type: 'string',
  })
  .option('db', {
    describe: 'MongoDB database name',
    demandOption: true,
    type: 'string',
  })
  .option('file', {
    describe: 'SQL file to execute',
    type: 'string',
  })
  .option('query', {
    alias: 'q',
    describe: 'SQL query to execute',
    type: 'string',
  })
  .option('json', {
    describe: 'Output results as JSON',
    default: false,
    type: 'boolean',
  })
  .option('pretty', {
    describe: 'Pretty-print JSON output',
    default: true,
    type: 'boolean',
  })
  .option('interactive', {
    alias: 'i',
    describe: 'Run in interactive mode',
    default: false,
    type: 'boolean',
  })
  .example('$0 --db mydb --query "SELECT * FROM users LIMIT 5"', 'Execute a single query')
  .example('$0 --db mydb --file queries.sql', 'Execute queries from a file')
  .example('$0 --db mydb --interactive', 'Run in interactive mode')
  .epilog('For more information, visit https://github.com/beekeeper-studio/queryleaf')
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'v')
  .parseSync();

// Helper function to display query results
function displayResults(results: any, isJson: boolean, isPretty: boolean) {
  if (isJson) {
    if (isPretty) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(JSON.stringify(results));
    }
  } else {
    // Simple table display for arrays of objects
    if (Array.isArray(results) && results.length > 0 && typeof results[0] === 'object') {
      // Get all unique keys from all objects
      const keys = new Set<string>();
      results.forEach((item) => {
        Object.keys(item).forEach((key) => keys.add(key));
      });

      const headers = Array.from(keys);

      // Calculate column widths (min 10, max 40)
      const columnWidths = headers.map((header) => {
        const values = results.map((item) =>
          item[header] !== undefined ? String(item[header]) : ''
        );

        const maxWidth = Math.max(header.length, ...values.map((v) => v.length));

        return Math.min(40, Math.max(10, maxWidth));
      });

      // Print headers
      console.log(
        headers.map((header, i) => chalk.bold(header.padEnd(columnWidths[i]))).join(' | ')
      );

      // Print separator
      console.log(headers.map((_, i) => '-'.repeat(columnWidths[i])).join('-+-'));

      // Print rows
      results.forEach((row) => {
        console.log(
          headers
            .map((header, i) => {
              const value = row[header] !== undefined ? String(row[header]) : '';
              return value.padEnd(columnWidths[i]);
            })
            .join(' | ')
        );
      });
    } else {
      // For non-array results or empty arrays
      console.log(results);
    }
  }

  // Print record count for arrays
  if (Array.isArray(results)) {
    console.log(chalk.cyan(`\n${results.length} record(s) returned`));
  }
}

// Execute a single SQL query
async function executeQuery(queryLeaf: QueryLeaf, sql: string, isJson: boolean, isPretty: boolean) {
  try {
    console.log(chalk.green(`Executing: ${sql}`));
    const startTime = Date.now();
    const results = await queryLeaf.execute(sql);
    const duration = Date.now() - startTime;

    displayResults(results, isJson, isPretty);
    console.log(chalk.gray(`\nExecution time: ${duration}ms`));
    return true;
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    return false;
  }
}

// Main function
async function main() {
  const mongoClient = new MongoClient(argv.uri as string);

  try {
    console.log(chalk.blue(`Connecting to MongoDB: ${argv.uri}`));
    await mongoClient.connect();
    console.log(chalk.green(`Connected to MongoDB, using database: ${argv.db}`));

    const queryLeaf = new QueryLeaf(mongoClient, argv.db as string);

    // Execute from file
    if (argv.file) {
      const filePath = path.resolve(process.cwd(), argv.file as string);
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }

      console.log(chalk.blue(`Executing SQL from file: ${filePath}`));
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      // Split file content by semicolons to get individual queries
      // Ignore semicolons inside quotes
      const queries =
        sqlContent
          .match(/(?:[^;"']+|"(?:\\"|[^"])*"|'(?:\\'|[^'])*')+/g)
          ?.map((q) => q.trim())
          .filter((q) => q.length > 0) || [];

      if (queries.length === 0) {
        console.log(chalk.yellow('No queries found in file.'));
        process.exit(0);
      }

      console.log(chalk.blue(`Found ${queries.length} queries in file.`));

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(chalk.blue(`\nExecuting query ${i + 1}/${queries.length}:`));
        await executeQuery(queryLeaf, query, argv.json as boolean, argv.pretty as boolean);
      }
    }
    // Execute single query
    else if (argv.query) {
      await executeQuery(
        queryLeaf,
        argv.query as string,
        argv.json as boolean,
        argv.pretty as boolean
      );
    }
    // Interactive mode
    else if (argv.interactive) {
      console.log(
        chalk.blue('Starting interactive SQL shell. Type .help for commands, .exit to quit.')
      );
      console.log(chalk.blue('Connected to database: ' + argv.db));

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'sql> ',
        terminal: true,
      });

      rl.prompt();

      let multilineQuery = '';

      rl.on('line', async (line) => {
        const trimmedLine = line.trim();

        // Handle special commands
        if (trimmedLine === '.exit' || trimmedLine === '.quit') {
          rl.close();
          return;
        }

        if (trimmedLine === '.help') {
          console.log(chalk.blue('Available commands:'));
          console.log('  .help     - Show this help message');
          console.log('  .tables   - List all collections in the database');
          console.log('  .exit     - Exit the shell');
          console.log('  .quit     - Exit the shell');
          console.log('  .clear    - Clear the current query buffer');
          console.log(
            '  .json     - Toggle JSON output mode (currently ' + (argv.json ? 'ON' : 'OFF') + ')'
          );
          console.log('\nSQL queries can span multiple lines. End with a semicolon to execute.');
          rl.prompt();
          return;
        }

        if (trimmedLine === '.tables') {
          try {
            const collections = await mongoClient
              .db(argv.db as string)
              .listCollections()
              .toArray();
            console.log(chalk.blue('Collections in database:'));
            collections.forEach((collection) => {
              console.log(`  ${collection.name}`);
            });
          } catch (error) {
            console.error(
              chalk.red(
                `Error listing collections: ${error instanceof Error ? error.message : String(error)}`
              )
            );
          }
          rl.prompt();
          return;
        }

        if (trimmedLine === '.clear') {
          multilineQuery = '';
          console.log(chalk.yellow('Query buffer cleared.'));
          rl.prompt();
          return;
        }

        if (trimmedLine === '.json') {
          argv.json = !argv.json;
          console.log(chalk.blue(`JSON output mode: ${argv.json ? 'ON' : 'OFF'}`));
          rl.prompt();
          return;
        }

        // Handle SQL query
        multilineQuery += line + ' ';

        // Execute on semicolon
        if (trimmedLine.endsWith(';')) {
          const query = multilineQuery.trim();
          multilineQuery = '';

          if (query.length > 1) {
            // Handle empty queries (just ";")
            await executeQuery(queryLeaf, query, argv.json as boolean, argv.pretty as boolean);
          }
        } else {
          // Show continuation prompt for multiline
          process.stdout.write('... ');
          return;
        }

        rl.prompt();
      });

      rl.on('close', () => {
        console.log(chalk.blue('\nGoodbye!'));
        process.exit(0);
      });

      return; // Keep process running for interactive mode
    } else {
      console.log(chalk.yellow('No query or file specified and not in interactive mode.'));
      console.log(chalk.yellow('Use --help to see available options.'));
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  } finally {
    if (!argv.interactive) {
      await mongoClient.close();
      console.log(chalk.blue('MongoDB connection closed.'));
    }
  }
}

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    console.error(
      chalk.red(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`)
    );
    process.exit(1);
  });
}
