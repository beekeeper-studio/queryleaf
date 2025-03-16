import { Parser as NodeSqlParser } from 'node-sql-parser';
import { SqlParser, SqlStatement } from './interfaces';

/**
 * SQL Parser implementation using node-sql-parser
 */
export class SqlParserImpl implements SqlParser {
  private parser: NodeSqlParser;

  constructor(options?: { database?: string }) {
    this.parser = new NodeSqlParser();
  }

  /**
   * Parse SQL string into a SqlStatement
   * @param sql SQL string to parse
   * @returns Parsed SQL statement object
   */
  parse(sql: string): SqlStatement {
    try {
      // Use MySQL as the database type since it has wide SQL support
      const ast = this.parser.astify(sql, { database: 'MySQL' });
      return {
        ast: Array.isArray(ast) ? ast[0] : ast, // Handle the case when parser returns an array
        text: sql
      };
    } catch (error) {
      throw new Error(`SQL parsing error: ${(error as Error).message}`);
    }
  }
}