import { Parser as NodeSqlParser } from 'node-sql-parser';
import { SqlParser, SqlStatement } from './interfaces';

// Custom MySQL mode with extensions to support our syntax needs
const CUSTOM_DIALECT = {
  name: 'SquongoMySQL',
  reserved: [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
    'TABLE', 'DATABASE', 'VIEW', 'INDEX', 'TRIGGER', 'PROCEDURE', 'FUNCTION'
  ],
  literalTokens: {
    // Add handling for array indexing syntax
    '[': { tokenType: 'BRACKET_OPEN', regex: /\[/ },
    ']': { tokenType: 'BRACKET_CLOSE', regex: /\]/ },
    '.': { tokenType: 'DOT', regex: /\./ }
  },
  operators: [
    // Standard operators
    '+', '-', '*', '/', '%', '=', '!=', '<>', '>', '<', '>=', '<=',
    // Add nested field operators
    '.'
  ]
};

/**
 * SQL Parser implementation using node-sql-parser
 */
export class SqlParserImpl implements SqlParser {
  private parser: NodeSqlParser;

  constructor(options?: { database?: string }) {
    // Create standard parser with MySQL mode
    this.parser = new NodeSqlParser();
  }

  /**
   * Parse SQL string into a SqlStatement
   * @param sql SQL string to parse
   * @returns Parsed SQL statement object
   */
  parse(sql: string): SqlStatement {
    try {
      // Preprocess SQL to transform array index notation to a form the parser can handle
      const preprocessedSql = this.preprocessArrayIndexes(sql);
      console.log('Preprocessed SQL:', preprocessedSql);
      
      // Parse with MySQL mode but try to handle our custom extensions
      const ast = this.parser.astify(preprocessedSql, { 
        database: 'MySQL'
      });
      
      return {
        ast: Array.isArray(ast) ? ast[0] : ast, // Handle the case when parser returns an array
        text: sql // Use original SQL for reference
      };
    } catch (error) {
      // If error happens and it's related to our extensions, try to handle it
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('[')) {
        // Make a more aggressive transformation of the SQL for bracket syntax
        const fallbackSql = this.aggressivePreprocessing(sql);
        console.log('Fallback SQL for array syntax:', fallbackSql);
        try {
          const ast = this.parser.astify(fallbackSql, { database: 'MySQL' });
          return {
            ast: Array.isArray(ast) ? ast[0] : ast,
            text: sql
          };
        } catch (fallbackErr) {
          const fallbackErrorMsg = fallbackErr instanceof Error ? 
            fallbackErr.message : String(fallbackErr);
          throw new Error(`SQL parsing error (fallback): ${fallbackErrorMsg}`);
        }
      }
      
      throw new Error(`SQL parsing error: ${errorMessage}`);
    }
  }
  
  /**
   * Preprocess SQL to transform array index notation into a form the parser can handle
   * 
   * This transforms:
   * items[0].name => items__ARRAY_0__name
   * 
   * We'll convert it back to MongoDB's dot notation later in the compiler.
   */
  private preprocessArrayIndexes(sql: string): string {
    // Replace array index notation with a placeholder format
    // This regex matches field references with array indexes like items[0] or items[0].name
    return sql.replace(/(\w+)\[(\d+)\](\.\w+)?/g, (match, field, index, suffix) => {
      if (suffix) {
        // For nested access like items[0].name => items__ARRAY_0__name
        return `${field}__ARRAY_${index}__${suffix.substring(1)}`;
      } else {
        // For simple array access like items[0] => items__ARRAY_0
        return `${field}__ARRAY_${index}`;
      }
    });
  }
  
  /**
   * More aggressive preprocessing for SQL that contains array syntax
   * This completely removes the array indexing and replaces it with a special column naming pattern
   */
  private aggressivePreprocessing(sql: string): string {
    // Replace items[0].name with items_0_name
    // This is a more aggressive approach that completely avoids bracket syntax
    return sql.replace(/(\w+)\[(\d+)\](\.(\w+))?/g, (match, field, index, dotPart, subfield) => {
      if (subfield) {
        return `${field}_${index}_${subfield}`;
      } else {
        return `${field}_${index}`;
      }
    });
  }
}