/**
 * Core interfaces for the Squongo SQL to MongoDB compiler
 */

/**
 * Represents an abstract command in the intermediate representation
 */
export interface Command {
  type: string;
  [key: string]: any;
}

/**
 * Base interface for all SQL statements
 */
export interface SqlStatement {
  type: string;
}

/**
 * Represents a SQL SELECT statement
 */
export interface SelectStatement extends SqlStatement {
  type: 'SELECT';
  fields: string[];
  from: string;
  where?: WhereClause;
  limit?: number;
  offset?: number;
  orderBy?: OrderByClause[];
}

/**
 * Represents a SQL INSERT statement
 */
export interface InsertStatement extends SqlStatement {
  type: 'INSERT';
  into: string;
  columns: string[];
  values: any[][];
}

/**
 * Represents a SQL UPDATE statement
 */
export interface UpdateStatement extends SqlStatement {
  type: 'UPDATE';
  table: string;
  set: { [key: string]: any };
  where?: WhereClause;
}

/**
 * Represents a SQL DELETE statement
 */
export interface DeleteStatement extends SqlStatement {
  type: 'DELETE';
  from: string;
  where?: WhereClause;
}

/**
 * Represents an ORDER BY clause
 */
export interface OrderByClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Represents a WHERE clause condition
 */
export interface WhereClause {
  operator: 'AND' | 'OR';
  conditions: Condition[];
}

/**
 * Represents a condition in a WHERE clause
 */
export interface Condition {
  type: 'COMPARISON' | 'LOGICAL' | 'IN' | 'BETWEEN' | 'LIKE' | 'NULL';
  field?: string;
  operator?: string;
  value?: any;
  left?: Condition;
  right?: Condition;
  values?: any[];
  not?: boolean;
}

/**
 * MongoDB command executor interface
 */
export interface CommandExecutor {
  execute(commands: Command[]): Promise<any>;
}

/**
 * SQL Parser interface
 */
export interface SqlParser {
  parse(sql: string): SqlStatement;
}

/**
 * SQL Compiler interface - converts SQL AST to MongoDB commands
 */
export interface SqlCompiler {
  compile(statement: SqlStatement): Command[];
}

/**
 * Main QueryLeaf interface
 */
export interface QueryLeaf {
  execute(sql: string): Promise<any>;
  parse(sql: string): SqlStatement;
  compile(statement: SqlStatement): Command[];
  getExecutor?(): any;
  close?(): Promise<void>;
}

/**
 * Alias for QueryLeaf (backwards compatibility)
 */
export interface Squongo extends QueryLeaf {
  execute(sql: string): Promise<any>;
  parse(sql: string): SqlStatement;
  compile(statement: SqlStatement): Command[];
}
