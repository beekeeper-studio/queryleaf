import {
  SqlCompiler,
  SqlStatement,
  Command,
  FindCommand,
  InsertCommand,
  UpdateCommand,
  DeleteCommand
} from './interfaces';
import { From } from 'node-sql-parser';

/**
 * SQL to MongoDB compiler implementation
 */
export class SqlCompilerImpl implements SqlCompiler {
  /**
   * Compile a SQL statement into MongoDB commands
   * @param statement SQL statement to compile
   * @returns Array of MongoDB commands
   */
  compile(statement: SqlStatement): Command[] {
    const ast = statement.ast;
    
    console.log('Compiling SQL AST:', JSON.stringify(ast, null, 2));
    
    // Pre-process the AST to handle nested fields that might be parsed as table references
    this.handleNestedFieldReferences(ast);
    
    let result: Command[];
    
    switch (ast.type) {
      case 'select':
        result = [this.compileSelect(ast)];
        break;
      case 'insert':
        result = [this.compileInsert(ast)];
        break;
      case 'update':
        result = [this.compileUpdate(ast)];
        break;
      case 'delete':
        result = [this.compileDelete(ast)];
        break;
      default:
        throw new Error(`Unsupported SQL statement type: ${ast.type}`);
    }
    
    console.log('Compiled to MongoDB command:', JSON.stringify(result, null, 2));
    
    return result;
  }

  /**
   * Compile a SELECT statement into a MongoDB FIND command
   */
  private compileSelect(ast: any): FindCommand {
    if (!ast.from || !Array.isArray(ast.from) || ast.from.length === 0) {
      throw new Error('FROM clause is required for SELECT statements');
    }

    const collection = this.extractTableName(ast.from[0]);
    
    const command: FindCommand = {
      type: 'FIND',
      collection,
      filter: ast.where ? this.convertWhere(ast.where) : undefined,
      projection: ast.columns ? this.convertColumns(ast.columns) : undefined,
    };

    if (ast.limit) {
      console.log('Limit found in AST:', JSON.stringify(ast.limit, null, 2));
      if (typeof ast.limit === 'object' && 'value' in ast.limit) {
        command.limit = Number(ast.limit.value);
      } else if (typeof ast.limit === 'object' && 'separator' in ast.limit && Array.isArray(ast.limit.value)) {
        // Handle MySQL style LIMIT
        command.limit = Number(ast.limit.value[0].value);
      }
    }

    if (ast.orderby) {
      command.sort = this.convertOrderBy(ast.orderby);
    }

    return command;
  }

  /**
   * Compile an INSERT statement into a MongoDB INSERT command
   */
  private compileInsert(ast: any): InsertCommand {
    if (!ast.table) {
      throw new Error('Table name is required for INSERT statements');
    }

    const collection = ast.table[0].table;
    
    if (!ast.values || !Array.isArray(ast.values)) {
      throw new Error('VALUES are required for INSERT statements');
    }

    console.log('INSERT values:', JSON.stringify(ast.values, null, 2));
    console.log('INSERT columns:', JSON.stringify(ast.columns, null, 2));
    
    const documents = ast.values.map((valueList: any) => {
      const document: Record<string, any> = {};
      
      if (!ast.columns || !Array.isArray(ast.columns)) {
        throw new Error('Columns are required for INSERT statements');
      }
      
      // Handle different forms of value lists
      let values: any[] = [];
      if (Array.isArray(valueList)) {
        values = valueList;
      } else if (valueList.type === 'expr_list' && Array.isArray(valueList.value)) {
        values = valueList.value;
      } else {
        console.warn('Unexpected valueList format:', JSON.stringify(valueList, null, 2));
        values = [valueList];
      }
      
      console.log('Processed values:', JSON.stringify(values, null, 2));
      
      ast.columns.forEach((column: any, index: number) => {
        let columnName: string;
        if (typeof column === 'string') {
          columnName = column;
        } else if (column.column) {
          columnName = column.column;
        } else {
          console.warn('Unrecognized column format:', JSON.stringify(column, null, 2));
          return;
        }
        
        if (index < values.length) {
          document[columnName] = this.convertValue(values[index]);
        }
      });
      
      console.log('Constructed document:', JSON.stringify(document, null, 2));
      return document;
    });

    return {
      type: 'INSERT',
      collection,
      documents
    };
  }

  /**
   * Compile an UPDATE statement into a MongoDB UPDATE command
   */
  private compileUpdate(ast: any): UpdateCommand {
    if (!ast.table) {
      throw new Error('Table name is required for UPDATE statements');
    }

    const collection = ast.table[0].table;
    
    if (!ast.set || !Array.isArray(ast.set)) {
      throw new Error('SET clause is required for UPDATE statements');
    }

    const update: Record<string, any> = {};
    
    ast.set.forEach((setItem: any) => {
      if (setItem.column && setItem.value) {
        update[setItem.column] = this.convertValue(setItem.value);
      }
    });

    return {
      type: 'UPDATE',
      collection,
      filter: ast.where ? this.convertWhere(ast.where) : undefined,
      update
    };
  }

  /**
   * Compile a DELETE statement into a MongoDB DELETE command
   */
  private compileDelete(ast: any): DeleteCommand {
    if (!ast.from || !Array.isArray(ast.from) || ast.from.length === 0) {
      throw new Error('FROM clause is required for DELETE statements');
    }

    const collection = this.extractTableName(ast.from[0]);

    return {
      type: 'DELETE',
      collection,
      filter: ast.where ? this.convertWhere(ast.where) : undefined
    };
  }

  /**
   * Extract table name from FROM clause
   */
  private extractTableName(from: From): string {
    if (typeof from === 'string') {
      return from;
    } else if (from.table) {
      return from.table;
    }
    throw new Error('Invalid FROM clause');
  }

  /**
   * Convert SQL WHERE clause to MongoDB filter
   */
  private convertWhere(where: any): Record<string, any> {
    if (!where) return {};
    
    if (where.type === 'binary_expr') {
      const { left, right, operator } = where;
      
      // Handle logical operators (AND, OR)
      if (operator === 'AND') {
        const leftFilter = this.convertWhere(left);
        const rightFilter = this.convertWhere(right);
        return { $and: [leftFilter, rightFilter] };
      } else if (operator === 'OR') {
        const leftFilter = this.convertWhere(left);
        const rightFilter = this.convertWhere(right);
        return { $or: [leftFilter, rightFilter] };
      }
      
      // Handle comparison operators
      if (typeof left === 'object' && 'column' in left && left.column) {
        const field = this.processFieldName(left.column);
        const value = this.convertValue(right);
        
        const filter: Record<string, any> = {};
        
        switch (operator) {
          case '=':
            filter[field] = value;
            break;
          case '!=':
          case '<>':
            filter[field] = { $ne: value };
            break;
          case '>':
            filter[field] = { $gt: value };
            break;
          case '>=':
            filter[field] = { $gte: value };
            break;
          case '<':
            filter[field] = { $lt: value };
            break;
          case '<=':
            filter[field] = { $lte: value };
            break;
          case 'IN':
            filter[field] = { $in: Array.isArray(value) ? value : [value] };
            break;
          case 'NOT IN':
            filter[field] = { $nin: Array.isArray(value) ? value : [value] };
            break;
          case 'LIKE':
            // Convert SQL LIKE pattern to MongoDB regex
            // % wildcard in SQL becomes .* in regex
            // _ wildcard in SQL becomes . in regex
            const pattern = String(value)
              .replace(/%/g, '.*')
              .replace(/_/g, '.');
            filter[field] = { $regex: new RegExp(`^${pattern}$`, 'i') };
            break;
          case 'BETWEEN':
            if (Array.isArray(right) && right.length === 2) {
              filter[field] = { 
                $gte: this.convertValue(right[0]), 
                $lte: this.convertValue(right[1]) 
              };
            } else {
              throw new Error('BETWEEN operator expects two values');
            }
            break;
          default:
            throw new Error(`Unsupported operator: ${operator}`);
        }
        
        return filter;
      }
    } else if (where.type === 'unary_expr') {
      // Handle NOT, IS NULL, IS NOT NULL
      if (where.operator === 'IS NULL' && typeof where.expr === 'object' && 'column' in where.expr) {
        const field = this.processFieldName(where.expr.column);
        return { [field]: { $eq: null } };
      } else if (where.operator === 'IS NOT NULL' && typeof where.expr === 'object' && 'column' in where.expr) {
        const field = this.processFieldName(where.expr.column);
        return { [field]: { $ne: null } };
      } else if (where.operator === 'NOT') {
        const subFilter = this.convertWhere(where.expr);
        return { $nor: [subFilter] };
      }
    }
    
    // If we can't parse the where clause, return an empty filter
    return {};
  }

  /**
   * Convert SQL value to MongoDB value
   */
  private convertValue(value: any): any {
    if (typeof value === 'object') {
      if ('value' in value) {
        return value.value;
      }
    }
    return value;
  }

  /**
   * Convert SQL columns to MongoDB projection
   */
  private convertColumns(columns: any[]): Record<string, any> {
    const projection: Record<string, any> = {};
    
    console.log('Converting columns to projection:', JSON.stringify(columns, null, 2));
    
    // If * is used, return empty projection (which means all fields)
    if (columns.some(col => col === '*' || 
        (typeof col === 'object' && col.expr && col.expr.type === 'star') ||
        (typeof col === 'object' && col.expr && col.expr.column === '*'))) {
      console.log('Star (*) detected, returning empty projection');
      return {};
    }
    
    columns.forEach(column => {
      if (typeof column === 'object') {
        if ('expr' in column && column.expr) {
          // Handle dot notation (nested fields)
          if ('column' in column.expr && column.expr.column) {
            const fieldName = this.processFieldName(column.expr.column);
            projection[fieldName] = 1;
          } else if (column.expr.type === 'column_ref' && column.expr.column) {
            const fieldName = this.processFieldName(column.expr.column);
            projection[fieldName] = 1;
          } else if (column.expr.type === 'binary_expr' && column.expr.operator === '.' && 
                     column.expr.left && column.expr.right) {
            // Handle explicit dot notation like table.column
            let fieldName = '';
            if (column.expr.left.column) {
              fieldName = column.expr.left.column;
            }
            if (fieldName && column.expr.right.column) {
              fieldName += '.' + column.expr.right.column;
              projection[fieldName] = 1;
            }
          }
        } else if ('type' in column && column.type === 'column_ref' && column.column) {
          const fieldName = this.processFieldName(column.column);
          projection[fieldName] = 1;
        } else if ('column' in column) {
          const fieldName = this.processFieldName(column.column);
          projection[fieldName] = 1;
        }
      } else if (typeof column === 'string') {
        const fieldName = this.processFieldName(column);
        projection[fieldName] = 1;
      }
    });
    
    console.log('Final projection:', JSON.stringify(projection, null, 2));
    
    return projection;
  }
  
  /**
   * Process a field name to handle nested fields and array indexing
   * Converts various formats to MongoDB dot notation:
   * - address.zip stays as address.zip (MongoDB supports dot notation natively)
   * - items__ARRAY_0__name becomes items.0.name 
   * - items_0_name becomes items.0.name (from aggressive preprocessing)
   * - table.column is recognized as a nested field, not a table reference
   */
  private processFieldName(fieldName: string): string {
    if (!fieldName) return fieldName;
    
    // First convert our placeholder format back to MongoDB dot notation
    // This transforms items__ARRAY_0__name => items.0.name
    let processed = fieldName.replace(/__ARRAY_(\d+)__/g, '.$1.');
    
    // Also handle the case where it's at the end of the string
    processed = processed.replace(/__ARRAY_(\d+)$/g, '.$1');
    
    // Handle the aggressive preprocessing format - items_0_name => items.0.name
    processed = processed.replace(/(\w+)_(\d+)_(\w+)/g, '$1.$2.$3');
    processed = processed.replace(/(\w+)_(\d+)$/g, '$1.$2');
    
    // If there's still array indexing with bracket notation, convert it too
    // This handles any direct [0] syntax that might have made it through the parser
    processed = processed.replace(/\[(\d+)\]/g, '.$1');
    
    return processed;
  }
  
  /**
   * Special handling for table references that might actually be nested fields
   * For example, in "SELECT address.zip FROM users", 
   * address.zip might be parsed as table "address", column "zip"
   */
  private handleNestedFieldReferences(ast: any): void {
    // Handle column references in SELECT clause
    if (ast.columns && Array.isArray(ast.columns)) {
      ast.columns.forEach((column: any) => {
        if (column.expr && column.expr.type === 'column_ref' && 
            column.expr.table && column.expr.column) {
          // This could be a nested field - convert table.column to a single column path
          column.expr.column = `${column.expr.table}.${column.expr.column}`;
          column.expr.table = null;
        }
      });
    }
    
    // Handle conditions in WHERE clause
    this.processWhereClauseForNestedFields(ast.where);
  }
  
  /**
   * Process WHERE clause to handle nested field references
   */
  private processWhereClauseForNestedFields(where: any): void {
    if (!where) return;
    
    if (where.type === 'binary_expr') {
      // Process left and right sides recursively
      this.processWhereClauseForNestedFields(where.left);
      this.processWhereClauseForNestedFields(where.right);
      
      // Handle column references in comparison expressions
      if (where.left && where.left.type === 'column_ref' && 
          where.left.table && where.left.column) {
        // Convert table.column format to a nested field path
        where.left.column = `${where.left.table}.${where.left.column}`;
        where.left.table = null;
      }
    } else if (where.type === 'unary_expr') {
      // Process expression in unary operators
      this.processWhereClauseForNestedFields(where.expr);
    }
  }

  /**
   * Convert SQL ORDER BY to MongoDB sort
   */
  private convertOrderBy(orderby: any[]): Record<string, any> {
    const sort: Record<string, any> = {};
    
    orderby.forEach(item => {
      if (typeof item === 'object' && 'expr' in item && item.expr) {
        if ('column' in item.expr && item.expr.column) {
          const column = item.expr.column;
          sort[column] = item.type === 'ASC' ? 1 : -1;
        }
      }
    });
    
    return sort;
  }
}