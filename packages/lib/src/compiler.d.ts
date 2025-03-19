import { SqlCompiler, SqlStatement, Command } from './interfaces';
/**
 * SQL to MongoDB compiler implementation
 */
export declare class SqlCompilerImpl implements SqlCompiler {
    /**
     * Compile a SQL statement into MongoDB commands
     * @param statement SQL statement to compile
     * @returns Array of MongoDB commands
     */
    compile(statement: SqlStatement): Command[];
    /**
     * Compile a SELECT statement into a MongoDB FIND command
     */
    private compileSelect;
    /**
     * Compile an INSERT statement into a MongoDB INSERT command
     */
    private compileInsert;
    /**
     * Compile an UPDATE statement into a MongoDB UPDATE command
     */
    private compileUpdate;
    /**
     * Compile a DELETE statement into a MongoDB DELETE command
     */
    private compileDelete;
    /**
     * Extract table name from FROM clause
     */
    private extractTableName;
    /**
     * Convert SQL WHERE clause to MongoDB filter
     */
    private convertWhere;
    /**
     * Convert SQL value to MongoDB value
     */
    private convertValue;
    /**
     * Convert SQL columns to MongoDB projection
     */
    private convertColumns;
    /**
     * Process a field name to handle nested fields and array indexing
     * Converts various formats to MongoDB dot notation:
     * - address.zip stays as address.zip (MongoDB supports dot notation natively)
     * - items__ARRAY_0__name becomes items.0.name
     * - items_0_name becomes items.0.name (from aggressive preprocessing)
     * - table.column is recognized as a nested field, not a table reference
     */
    private processFieldName;
    /**
     * Special handling for table references that might actually be nested fields
     * For example, in "SELECT address.zip FROM users",
     * address.zip might be parsed as table "address", column "zip"
     */
    private handleNestedFieldReferences;
    /**
     * Process WHERE clause to handle nested field references
     */
    private processWhereClauseForNestedFields;
    /**
     * Convert SQL ORDER BY to MongoDB sort
     */
    private convertOrderBy;
    /**
     * Convert SQL GROUP BY to MongoDB group stage
     */
    private convertGroupBy;
    /**
     * Create a MongoDB aggregation pipeline from a FindCommand
     */
    private createAggregatePipeline;
    /**
     * Check if projection needs to be converted to $project format
     */
    private needsAggregationProjection;
    /**
     * Convert a MongoDB projection to $project format used in aggregation pipeline
     */
    private convertToAggregationProjection;
    /**
     * Convert SQL JOINs to MongoDB $lookup stages
     */
    private convertJoins;
    /**
     * Extract join conditions from the WHERE clause
     */
    private extractJoinConditions;
}
