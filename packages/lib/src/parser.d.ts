import { SqlParser, SqlStatement } from './interfaces';
/**
 * SQL Parser implementation using node-sql-parser
 */
export declare class SqlParserImpl implements SqlParser {
    private parser;
    constructor(options?: {
        database?: string;
    });
    /**
     * Parse SQL string into a SqlStatement
     * @param sql SQL string to parse
     * @returns Parsed SQL statement object
     */
    parse(sql: string): SqlStatement;
    /**
     * Preprocess nested field access in SQL before parsing
     *
     * This helps ensure that the parser correctly handles nested fields like:
     * contact.address.city => becomes a properly parsed reference
     *
     * For deep nested fields (with more than one dot), we need special handling
     * since the SQL parser typically expects table.column format only
     */
    private preprocessNestedFields;
    private _nestedFieldReplacements;
    /**
     * Post-process the AST to correctly handle nested fields
     *
     * This ensures that expressions like "contact.address.city" are correctly
     * recognized as a single column reference rather than a table/column pair.
     */
    private postProcessAst;
    /**
     * Process nested fields in the SELECT clause
     */
    private processSelectClause;
    /**
     * Process nested fields in the WHERE clause
     */
    private processWhereClause;
    /**
     * Process WHERE expression recursively to handle nested fields
     */
    private processWhereExpr;
    /**
     * Check if a name is an actual table reference in the FROM clause
     *
     * This helps distinguish between table.column notation and nested field access
     */
    private isActualTableReference;
    /**
     * Preprocess SQL to transform array index notation into a form the parser can handle
     *
     * This transforms:
     * items[0].name => items__ARRAY_0__name
     *
     * We'll convert it back to MongoDB's dot notation later in the compiler.
     */
    private preprocessArrayIndexes;
    /**
     * More aggressive preprocessing for SQL that contains array syntax
     * This completely removes the array indexing and replaces it with a special column naming pattern
     */
    private aggressivePreprocessing;
}
