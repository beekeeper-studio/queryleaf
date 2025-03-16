import { AST } from 'node-sql-parser';

/**
 * Represents a parsed SQL statement
 */
export interface SqlStatement {
  ast: AST;
  text: string;
}

/**
 * Command types supported by the MongoDB executor
 */
export type CommandType = 'FIND' | 'INSERT' | 'UPDATE' | 'DELETE' | 'AGGREGATE';

/**
 * Base interface for all MongoDB commands
 */
export interface BaseCommand {
  type: CommandType;
  collection: string;
}

/**
 * Find command for MongoDB
 */
export interface FindCommand extends BaseCommand {
  type: 'FIND';
  filter?: Record<string, any>;
  projection?: Record<string, any>;
  sort?: Record<string, any>;
  limit?: number;
  skip?: number;
}

/**
 * Insert command for MongoDB
 */
export interface InsertCommand extends BaseCommand {
  type: 'INSERT';
  documents: Record<string, any>[];
}

/**
 * Update command for MongoDB
 */
export interface UpdateCommand extends BaseCommand {
  type: 'UPDATE';
  filter?: Record<string, any>;
  update: Record<string, any>;
  upsert?: boolean;
}

/**
 * Delete command for MongoDB
 */
export interface DeleteCommand extends BaseCommand {
  type: 'DELETE';
  filter?: Record<string, any>;
}

/**
 * Aggregate command for MongoDB
 */
export interface AggregateCommand extends BaseCommand {
  type: 'AGGREGATE';
  pipeline: Record<string, any>[];
}

/**
 * Union type of all MongoDB commands
 */
export type Command = FindCommand | InsertCommand | UpdateCommand | DeleteCommand | AggregateCommand;

/**
 * SQL parser interface
 */
export interface SqlParser {
  parse(sql: string): SqlStatement;
}

/**
 * SQL to MongoDB compiler interface
 */
export interface SqlCompiler {
  compile(statement: SqlStatement): Command[];
}

/**
 * MongoDB command executor interface
 */
export interface CommandExecutor {
  connect(): Promise<void>;
  close(): Promise<void>;
  execute(commands: Command[]): Promise<any>;
}

/**
 * Main Squongo interface
 */
export interface Squongo {
  execute(sql: string): Promise<any>;
  parse(sql: string): SqlStatement;
  compile(statement: SqlStatement): Command[];
  getExecutor(): CommandExecutor;
  close(): Promise<void>;
}