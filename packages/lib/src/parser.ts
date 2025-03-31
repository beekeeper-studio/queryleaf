import { Parser as NodeSqlParser } from 'node-sql-parser';
import { SqlParser, SqlStatement } from './interfaces';
import debug from 'debug';

const log = debug('queryleaf:parser');

// Custom PostgreSQL mode with extensions to support our syntax needs
const CUSTOM_DIALECT = {
  name: 'QueryLeafPostgreSQL',
  reserved: [
    'SELECT',
    'FROM',
    'WHERE',
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'DROP',
    'TABLE',
    'DATABASE',
    'VIEW',
    'INDEX',
    'TRIGGER',
    'PROCEDURE',
    'FUNCTION',
  ],
  literalTokens: {
    // Add handling for array indexing syntax
    '[': { tokenType: 'BRACKET_OPEN', regex: /\[/ },
    ']': { tokenType: 'BRACKET_CLOSE', regex: /\]/ },
    '.': { tokenType: 'DOT', regex: /\./ },
  },
  operators: [
    // Standard operators
    '+',
    '-',
    '*',
    '/',
    '%',
    '=',
    '!=',
    '<>',
    '>',
    '<',
    '>=',
    '<=',
    // Add nested field operators
    '.',
  ],
};

/**
 * SQL Parser implementation using node-sql-parser
 */
export class SqlParserImpl implements SqlParser {
  private parser: NodeSqlParser;

  constructor(options?: { database?: string }) {
    // Create standard parser with PostgreSQL mode
    this.parser = new NodeSqlParser();
  }

  /**
   * Parse SQL string into a SqlStatement
   * @param sql SQL string to parse
   * @returns Parsed SQL statement object
   */
  parse(sql: string): SqlStatement {
    try {
      // First, handle nested dot notation in field access
      const preprocessedNestedSql = this.preprocessNestedFields(sql);

      // Then transform array index notation to a form the parser can handle
      const preprocessedSql = this.preprocessArrayIndexes(preprocessedNestedSql);
      log('Preprocessed SQL:', preprocessedSql);

      // Parse with PostgreSQL mode but try to handle our custom extensions
      const ast = this.parser.astify(preprocessedSql, {
        database: 'PostgreSQL',
      });

      // Process the AST to properly handle nested fields
      const processedAst = this.postProcessAst(ast);

      return {
        ast: Array.isArray(processedAst) ? processedAst[0] : processedAst,
        text: sql, // Use original SQL for reference
        metadata: {
          nestedFieldReplacements: this._nestedFieldReplacements,
        },
      };
    } catch (error) {
      // If error happens and it's related to our extensions, try to handle it
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('[')) {
        // Make a more aggressive transformation of the SQL for bracket syntax
        const fallbackSql = this.aggressivePreprocessing(sql);
        log('Fallback SQL for array syntax:', fallbackSql);
        try {
          const ast = this.parser.astify(fallbackSql, { database: 'PostgreSQL' });
          const processedAst = this.postProcessAst(ast);
          return {
            ast: Array.isArray(processedAst) ? processedAst[0] : processedAst,
            text: sql,
            metadata: {
              nestedFieldReplacements: this._nestedFieldReplacements,
            },
          };
        } catch (fallbackErr) {
          const fallbackErrorMsg =
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          throw new Error(`SQL parsing error (fallback): ${fallbackErrorMsg}`);
        }
      }

      throw new Error(`SQL parsing error: ${errorMessage}`);
    }
  }

  /**
   * Preprocess nested field access in SQL before parsing
   *
   * This helps ensure that the parser correctly handles nested fields like:
   * contact.address.city => becomes a properly parsed reference
   *
   * For deep nested fields (with more than one dot), we need special handling
   * since the SQL parser typically expects table.column format only
   */
  private preprocessNestedFields(sql: string): string {
    log('Processing nested fields in SQL:', sql);

    // Keep track of replacements to restore them later
    const replacements: [string, string][] = [];

    // Check if this is an UPDATE statement
    if (sql.trim().toUpperCase().startsWith('UPDATE')) {
      // Handle multi-level nested fields in UPDATE statements' SET clause
      // This regex looks for patterns like: SET contact.address.city = 'Boston', other.field = 'value'
      const setNestedFieldRegex = /SET\s+(.*?)(?:\s+WHERE|$)/is;
      const setMatch = setNestedFieldRegex.exec(sql);

      if (setMatch && setMatch[1]) {
        const setPart = setMatch[1];
        // Split by commas to get individual assignments
        const assignments = setPart.split(',');

        let modifiedSetPart = setPart;

        // Process each assignment
        for (const assignment of assignments) {
          // This regex extracts the field name before the equals sign
          const fieldMatch = /^\s*([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})\s*=/i.exec(assignment);

          if (fieldMatch && fieldMatch[1]) {
            const nestedField = fieldMatch[1];
            // Create a placeholder name
            const placeholder = `__NESTED_${replacements.length}__`;

            // Store the replacement
            replacements.push([placeholder, nestedField]);

            // Replace in the set part
            modifiedSetPart = modifiedSetPart.replace(nestedField, placeholder);
          }
        }

        // Replace the whole SET part
        sql = sql.replace(setPart, modifiedSetPart);
      }
    }

    // Process WHERE clause nested fields
    // This regex matches multi-level nested fields in WHERE conditions
    // It looks for patterns like: WHERE contact.address.city = 'Boston'
    const whereNestedFieldRegex =
      /WHERE\s+([a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+){1,})\s*(=|!=|<>|>|<|>=|<=|LIKE|IN|NOT IN)/gi;

    // Replace deep nested fields in WHERE clause with placeholders
    let processedSql = sql.replace(whereNestedFieldRegex, (match, nestedField, _, operator) => {
      // Create a placeholder name
      const placeholder = `__NESTED_${replacements.length}__`;

      // Store the replacement
      replacements.push([placeholder, nestedField]);

      // Replace with the placeholder
      return `WHERE ${placeholder} ${operator}`;
    });

    // Add debug info about replacements
    if (replacements.length > 0) {
      log('Nested field replacements:', JSON.stringify(replacements, null, 2));
    }

    // Store the replacements in this instance for later use
    this._nestedFieldReplacements = replacements;

    return processedSql;
  }

  // Store replacements for later reference
  private _nestedFieldReplacements: [string, string][] = [];

  /**
   * Post-process the AST to correctly handle nested fields
   *
   * This ensures that expressions like "contact.address.city" are correctly
   * recognized as a single column reference rather than a table/column pair.
   */
  private postProcessAst(ast: any): any {
    // Clone the AST to avoid modifying the original
    const processed = JSON.parse(JSON.stringify(ast));

    // Handle SELECT clause nested fields
    this.processSelectClause(processed);

    // Handle WHERE clause nested fields
    this.processWhereClause(processed);

    log('Post-processed AST:', JSON.stringify(processed, null, 2));
    return processed;
  }

  /**
   * Process nested fields in the SELECT clause
   */
  private processSelectClause(ast: any): void {
    if (!ast || (!Array.isArray(ast) && typeof ast !== 'object')) return;

    // Handle array of statements
    if (Array.isArray(ast)) {
      ast.forEach((item) => this.processSelectClause(item));
      return;
    }

    // Only process SELECT statements
    if (ast.type !== 'select' || !ast.columns) return;

    // Process each column in the SELECT list
    ast.columns.forEach((column: any) => {
      if (column.expr && column.expr.type === 'column_ref') {
        // If the column has table.field notation, check if it should be a nested field
        if (
          column.expr.table &&
          column.expr.column &&
          !this.isActualTableReference(column.expr.table, ast)
        ) {
          // It's likely a nested field, not a table reference
          column.expr.column = `${column.expr.table}.${column.expr.column}`;
          column.expr.table = null;
        }
      }
    });
  }

  /**
   * Process nested fields in the WHERE clause
   */
  private processWhereClause(ast: any): void {
    if (!ast || (!Array.isArray(ast) && typeof ast !== 'object')) return;

    // Handle array of statements
    if (Array.isArray(ast)) {
      ast.forEach((item) => this.processWhereClause(item));
      return;
    }

    // No WHERE clause to process
    if (!ast.where) return;

    // Process the WHERE clause recursively
    this.processWhereExpr(ast.where, ast);
  }

  /**
   * Process WHERE expression recursively to handle nested fields
   */
  private processWhereExpr(expr: any, ast: any): void {
    if (!expr || typeof expr !== 'object') return;

    if (expr.type === 'binary_expr') {
      // Process both sides of binary expressions
      this.processWhereExpr(expr.left, ast);
      this.processWhereExpr(expr.right, ast);

      // Check for column references in the left side of the expression
      if (expr.left && expr.left.type === 'column_ref') {
        // First, check if this is a placeholder that needs to be restored
        if (
          expr.left.column &&
          expr.left.column.startsWith('__NESTED_') &&
          expr.left.column.endsWith('__')
        ) {
          // Find the corresponding replacement
          const placeholderIndex = parseInt(
            expr.left.column.replace('__NESTED_', '').replace('__', '')
          );
          if (this._nestedFieldReplacements.length > placeholderIndex) {
            // Restore the original nested field name
            const [_, originalField] = this._nestedFieldReplacements[placeholderIndex];
            log(`Restoring nested field: ${expr.left.column} -> ${originalField}`);
            expr.left.column = originalField;
            expr.left.table = null;
          }
        }
        // Then check for table.column notation that should be a nested field
        else if (
          expr.left.table &&
          expr.left.column &&
          !this.isActualTableReference(expr.left.table, ast)
        ) {
          // Likely a nested field access, not a table reference
          expr.left.column = `${expr.left.table}.${expr.left.column}`;
          expr.left.table = null;
        }
      }
    } else if (expr.type === 'unary_expr') {
      // Process the expression in unary operators
      this.processWhereExpr(expr.expr, ast);
    }
  }

  /**
   * Check if a name is an actual table reference in the FROM clause
   *
   * This helps distinguish between table.column notation and nested field access
   */
  private isActualTableReference(name: string, ast: any): boolean {
    if (!ast.from || !Array.isArray(ast.from)) return false;

    // Check if the name appears as a table name or alias in the FROM clause
    return ast.from.some((fromItem: any) => {
      return fromItem.table === name || fromItem.as === name;
    });
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
