# Command-Line Interface

QueryLeaf provides a command-line interface (CLI) that allows you to execute SQL queries against a MongoDB database directly from your terminal. This is useful for quick queries, automation scripts, or when you don't need a full web interface.

## Installation

The CLI is included with the QueryLeaf package. If you've installed QueryLeaf globally, you can use it directly from your terminal:

```bash
npm install -g queryleaf
```

## Usage

### Basic Usage

```bash
queryleaf --db <database-name> --query "SELECT * FROM users LIMIT 10"
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--uri` | MongoDB connection URI | `mongodb://localhost:27017` |
| `--db` | MongoDB database name (required) | - |
| `--file` | SQL file to execute | - |
| `--query`, `-q` | SQL query to execute | - |
| `--json` | Output results as JSON | `false` |
| `--pretty` | Pretty-print JSON output | `true` |
| `--interactive`, `-i` | Run in interactive mode | `false` |
| `--help`, `-h` | Show help | - |
| `--version`, `-v` | Show version | - |

### Examples

#### Execute a Single Query

```bash
queryleaf --db mydb --query "SELECT * FROM users WHERE age > 21"
```

#### Execute Multiple Queries from a File

Create a file named `queries.sql` with multiple SQL statements:

```sql
SELECT * FROM users LIMIT 5;
SELECT name, email FROM users WHERE active = true;
```

Then execute it:

```bash
queryleaf --db mydb --file queries.sql
```

#### Output Results as JSON

```bash
queryleaf --db mydb --query "SELECT * FROM products" --json
```

#### Interactive Mode

The interactive mode provides a SQL shell experience:

```bash
queryleaf --db mydb --interactive
```

In interactive mode, you can:

- Type SQL queries that end with a semicolon to execute them
- Use multi-line queries (continue typing until you add a semicolon)
- Use special commands:
  - `.help` - Show help information
  - `.tables` - List all collections in the database
  - `.exit` or `.quit` - Exit the shell
  - `.clear` - Clear the current query buffer
  - `.json` - Toggle JSON output mode

## Examples

### Basic Query

```bash
$ queryleaf --db inventory --query "SELECT * FROM products WHERE price > 100 LIMIT 5"
```

### Executing Complex Queries

```bash
$ queryleaf --db sales --query "SELECT category, SUM(total) as revenue FROM orders GROUP BY category ORDER BY revenue DESC"
```

### Using in Scripts

You can use the CLI in shell scripts:

```bash
#!/bin/bash
# backup-data.sh

# Export data as JSON
queryleaf --db analytics --query "SELECT * FROM events WHERE date >= '2023-01-01'" --json > events_backup.json
```

### Interactive Session Example

```
$ queryleaf --db test --interactive

Starting interactive SQL shell. Type .help for commands, .exit to quit.
Connected to database: test
sql> .tables
Collections in database:
  users
  products
  orders

sql> SELECT * FROM users LIMIT 2;
Executing: SELECT * FROM users LIMIT 2;
_id       | name      | email                | age       | active    
----------+-----------+----------------------+-----------+-----------
6079c40f9 | John Doe  | john@example.com     | 30        | true      
6079c41a5 | Jane Smith| jane@example.com     | 25        | true      

2 record(s) returned
Execution time: 15ms

sql> SELECT COUNT(*) as count FROM users WHERE active = true;
Executing: SELECT COUNT(*) as count FROM users WHERE active = true;
count     
----------
42        

1 record(s) returned
Execution time: 12ms

sql> .exit
Goodbye!
```

## Advanced Usage

### Piping Data

You can pipe query results to other command-line tools:

```bash
# Count lines of output
queryleaf --db logs --query "SELECT * FROM events" | wc -l

# Filter results with grep
queryleaf --db users --query "SELECT * FROM logins" | grep "failed"

# Process JSON output with jq
queryleaf --db analytics --query "SELECT * FROM pageviews" --json | jq '.[] | select(.duration > 60)'
```

### Using Environment Variables

You can use environment variables to avoid typing connection details repeatedly:

```bash
# Set environment variables
export MONGO_URI="mongodb://user:password@hostname:27017"
export MONGO_DB="production"

# Use them in your query
queryleaf --uri "$MONGO_URI" --db "$MONGO_DB" --query "SELECT * FROM users"
```