import { 
  SqlStatement, 
  Command, 
  SqlParser, 
  SqlCompiler, 
  CommandExecutor,
  Squongo as QueryLeaf
} from './interfaces';
import { SqlParserImpl } from './parser';
import { SqlCompilerImpl } from './compiler';
import { MongoExecutor } from './executor';

/**
 * QueryLeaf implementation
 */
class QueryLeafImpl implements QueryLeaf {
  private parser: SqlParser;
  private compiler: SqlCompiler;
  private executor: CommandExecutor;

  /**
   * Create a new QueryLeaf instance
   * @param parser SQL parser
   * @param compiler SQL compiler
   * @param executor Command executor
   */
  constructor(parser: SqlParser, compiler: SqlCompiler, executor: CommandExecutor) {
    this.parser = parser;
    this.compiler = compiler;
    this.executor = executor;
  }

  /**
   * Execute a SQL query on MongoDB
   * @param sql SQL query string
   * @returns Query results
   */
  async execute(sql: string): Promise<any> {
    const statement = this.parse(sql);
    const commands = this.compile(statement);
    return await this.executor.execute(commands);
  }

  /**
   * Parse a SQL query string
   * @param sql SQL query string
   * @returns Parsed SQL statement
   */
  parse(sql: string): SqlStatement {
    return this.parser.parse(sql);
  }

  /**
   * Compile a SQL statement to MongoDB commands
   * @param statement SQL statement
   * @returns MongoDB commands
   */
  compile(statement: SqlStatement): Command[] {
    return this.compiler.compile(statement);
  }
  
  /**
   * Get the command executor instance
   * @returns Command executor
   */
  getExecutor(): CommandExecutor {
    return this.executor;
  }
  
  /**
   * Close the MongoDB connection
   */
  async close(): Promise<void> {
    await this.executor.close();
  }
}

/**
 * Create a new QueryLeaf instance
 * @param connectionString MongoDB connection string
 * @param dbName Database name
 * @returns QueryLeaf instance
 */
export function createQueryLeaf(connectionString: string, dbName: string): QueryLeaf {
  const parser = new SqlParserImpl();
  const compiler = new SqlCompilerImpl();
  const executor = new MongoExecutor(connectionString, dbName);
  
  return new QueryLeafImpl(parser, compiler, executor);
}

/**
 * Create a new Squongo instance - alias for createQueryLeaf for backwards compatibility
 * @deprecated Use createQueryLeaf instead
 * @param connectionString MongoDB connection string
 * @param dbName Database name
 * @returns QueryLeaf instance
 */
export function createSquongo(connectionString: string, dbName: string): QueryLeaf {
  console.warn("Warning: createSquongo is deprecated, use createQueryLeaf instead");
  return createQueryLeaf(connectionString, dbName);
}

// Export interfaces and implementation classes
export {
  SqlStatement,
  Command,
  SqlParser,
  SqlCompiler,
  CommandExecutor,
  QueryLeaf,
  Squongo, // For backwards compatibility
  SqlParserImpl,
  SqlCompilerImpl,
  MongoExecutor,
  QueryLeafImpl
};

// Re-export interfaces
export * from './interfaces';