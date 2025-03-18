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
import debug from 'debug';

const log = debug('queryleaf:compiler');

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
    
    log('Compiling SQL AST:', JSON.stringify(ast, null, 2));
    
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
    
    log('Compiled to MongoDB command:', JSON.stringify(result, null, 2));
    
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

    // Check if we need to use aggregate pipeline for column aliases
    const hasColumnAliases = ast.columns && Array.isArray(ast.columns) && 
                      ast.columns.some((col: any) => col.as);
    
    // Handle GROUP BY clause
    if (ast.groupby) {
      command.group = this.convertGroupBy(ast.groupby, ast.columns);
      
      // Check if we need to use aggregate pipeline instead of simple find
      if (command.group) {
        command.pipeline = this.createAggregatePipeline(command);
      }
    }
    
    // Handle JOINs
    if (ast.from && ast.from.length > 1) {
      command.lookup = this.convertJoins(ast.from, ast.where);
      
      // When using JOINs, we need to use the aggregate pipeline
      if (!command.pipeline) {
        command.pipeline = this.createAggregatePipeline(command);
      }
    }
    
    // If we have column aliases, we need to use aggregate pipeline with $project
    if (hasColumnAliases && !command.pipeline) {
      command.pipeline = this.createAggregatePipeline(command);
    }

    if (ast.limit) {
      log('Limit found in AST:', JSON.stringify(ast.limit, null, 2));
      if (typeof ast.limit === 'object' && 'value' in ast.limit && ast.limit.value) {
        // Standard PostgreSQL LIMIT format
        command.limit = Number(ast.limit.value);
      } else if (typeof ast.limit === 'object' && 'seperator' in ast.limit && Array.isArray(ast.limit.value)) {
        // Handle PostgreSQL style LIMIT
        if (ast.limit.value.length > 0) {
          command.limit = Number(ast.limit.value[0].value);
        }
        // If value array is empty, it means no LIMIT was specified, so we don't set a limit
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

    log('INSERT values:', JSON.stringify(ast.values, null, 2));
    log('INSERT columns:', JSON.stringify(ast.columns, null, 2));
    
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
      
      log('Processed values:', JSON.stringify(values, null, 2));
      
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
      
      log('Constructed document:', JSON.stringify(document, null, 2));
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
      // Handle expression lists (for IN operator)
      if (value.type === 'expr_list' && Array.isArray(value.value)) {
        return value.value.map((item: any) => this.convertValue(item));
      }
      // Handle single values with value property
      else if ('value' in value) {
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
    
    log('Converting columns to projection:', JSON.stringify(columns, null, 2));
    
    // If * is used, return empty projection (which means all fields)
    if (columns.some(col => col === '*' || 
        (typeof col === 'object' && col.expr && col.expr.type === 'star') ||
        (typeof col === 'object' && col.expr && col.expr.column === '*'))) {
      log('Star (*) detected, returning empty projection');
      return {};
    }
    
    columns.forEach(column => {
      if (typeof column === 'object') {
        if ('expr' in column && column.expr) {
          // Handle dot notation (nested fields)
          if ('column' in column.expr && column.expr.column) {
            const fieldName = this.processFieldName(column.expr.column);
            const outputField = column.as || fieldName;
            // For find queries, MongoDB projection uses 1
            projection[fieldName] = 1;
            
            // For nested fields, also include the parent field
            if (fieldName.includes('.')) {
              const parentField = fieldName.split('.')[0];
              projection[parentField] = 1;
            }
          } else if (column.expr.type === 'column_ref' && column.expr.column) {
            const fieldName = this.processFieldName(column.expr.column);
            const outputField = column.as || fieldName;
            // For find queries, MongoDB projection uses 1
            projection[fieldName] = 1;
            
            // For nested fields, also include the parent field
            if (fieldName.includes('.')) {
              const parentField = fieldName.split('.')[0];
              projection[parentField] = 1;
            }
          } else if (column.expr.type === 'binary_expr' && column.expr.operator === '.' && 
                     column.expr.left && column.expr.right) {
            // Handle explicit dot notation like table.column
            let fieldName = '';
            if (column.expr.left.column) {
              fieldName = column.expr.left.column;
            }
            if (fieldName && column.expr.right.column) {
              fieldName += '.' + column.expr.right.column;
              const outputField = column.as || fieldName;
              // For find queries, MongoDB projection uses 1
              projection[fieldName] = 1;
              
              // Also include the parent field
              const parentField = fieldName.split('.')[0];
              projection[parentField] = 1;
            }
          }
        } else if ('type' in column && column.type === 'column_ref' && column.column) {
          const fieldName = this.processFieldName(column.column);
          const outputField = column.as || fieldName;
          // For find queries, MongoDB projection uses 1
          projection[fieldName] = 1;
          
          // For nested fields, also include the parent field
          if (fieldName.includes('.')) {
            const parentField = fieldName.split('.')[0];
            projection[parentField] = 1;
          }
        } else if ('column' in column) {
          const fieldName = this.processFieldName(column.column);
          const outputField = column.as || fieldName;
          // For find queries, MongoDB projection uses 1
          projection[fieldName] = 1;
          
          // For nested fields, also include the parent field
          if (fieldName.includes('.')) {
            const parentField = fieldName.split('.')[0];
            projection[parentField] = 1;
          }
        }
      } else if (typeof column === 'string') {
        const fieldName = this.processFieldName(column);
        // For find queries, MongoDB projection uses 1
        projection[fieldName] = 1;
        
        // For nested fields, also include the parent field
        if (fieldName.includes('.')) {
          const parentField = fieldName.split('.')[0];
          projection[parentField] = 1;
        }
      }
    });
    
    log('Final projection:', JSON.stringify(projection, null, 2));
    
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
    
    log(`Processing field name: "${fieldName}"`);
    
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
    
    // Handle nested field access directly
    // MongoDB already uses dot notation for nested fields, so we can use it as is
    if (processed.includes('.')) {
      log(`Using nested field in MongoDB filter: "${processed}"`);
    }
    
    return processed;
  }
  
  /**
   * Special handling for table references that might actually be nested fields
   * For example, in "SELECT address.zip FROM users", 
   * address.zip might be parsed as table "address", column "zip"
   */
  private handleNestedFieldReferences(ast: any): void {
    log('Handling nested field references in AST');
    
    // Handle column references in SELECT clause
    if (ast.columns && Array.isArray(ast.columns)) {
      ast.columns.forEach((column: any) => {
        if (column.expr && column.expr.type === 'column_ref' && 
            column.expr.table && column.expr.column) {
          // This could be a nested field - convert table.column to a single column path
          column.expr.column = `${column.expr.table}.${column.expr.column}`;
          column.expr.table = null;
          log(`Converted SELECT column to nested field: ${column.expr.column}`);
        }
      });
    }
    
    // Handle conditions in WHERE clause
    this.processWhereClauseForNestedFields(ast.where);
    
    // For debugging - show the resulting AST after transformation
    log('AST after nested field handling:', JSON.stringify(ast?.where, null, 2));
  }
  
  /**
   * Process WHERE clause to handle nested field references
   */
  private processWhereClauseForNestedFields(where: any): void {
    if (!where) return;
    
    log('Processing WHERE clause for nested fields:', JSON.stringify(where, null, 2));
    
    if (where.type === 'binary_expr') {
      // Process left and right sides recursively
      this.processWhereClauseForNestedFields(where.left);
      this.processWhereClauseForNestedFields(where.right);
      
      // Handle column references in comparison expressions
      if (where.left && where.left.type === 'column_ref') {
        log('Processing column reference:', JSON.stringify(where.left, null, 2));
        
        // Handle both direct dot notation in column name and table.column format
        if (where.left.column && where.left.column.includes('.')) {
          // Already has dot notation, just keep it
          log('Column already has dot notation:', where.left.column);
        } else if (where.left.table && where.left.column) {
          // Convert table.column format to a nested field path
          log('Converting table.column to nested path:', 
            `${where.left.table}.${where.left.column}`);
          where.left.column = `${where.left.table}.${where.left.column}`;
          where.left.table = null;
        }
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
          const column = this.processFieldName(item.expr.column);
          sort[column] = item.type === 'ASC' ? 1 : -1;
        }
      }
    });
    
    return sort;
  }

  /**
   * Convert SQL GROUP BY to MongoDB group stage
   */
  private convertGroupBy(groupby: any[], columns: any[]): { _id: any; [key: string]: any } | undefined {
    if (!groupby || !Array.isArray(groupby) || groupby.length === 0) {
      return undefined;
    }

    log('Converting GROUP BY:', JSON.stringify(groupby, null, 2));
    log('With columns:', JSON.stringify(columns, null, 2));

    // Create the group stage
    let group: { _id: any; [key: string]: any };
    
    // If there's only one group by field, simplify the _id structure
    if (groupby.length === 1) {
      // Extract the single field name
      let singleField = '';
      if (typeof groupby[0] === 'object') {
        // Type 1: { column: 'field' }
        if (groupby[0].column) {
          singleField = this.processFieldName(groupby[0].column);
        } 
        // Type 2: { type: 'column_ref', column: 'field' }
        else if (groupby[0].type === 'column_ref' && groupby[0].column) {
          singleField = this.processFieldName(groupby[0].column);
        }
        // Type 3: { expr: { column: 'field' } }
        else if (groupby[0].expr && groupby[0].expr.column) {
          singleField = this.processFieldName(groupby[0].expr.column);
        }
      }
      
      if (singleField) {
        // For a single field, use a simplified ID structure
        group = {
          _id: `$${singleField}`,
          [singleField]: { $first: `$${singleField}` } // Include the field in results too
        };
      } else {
        // Fallback if we can't extract the field
        group = { _id: null };
      }
    } else {
      // For multiple fields, use the object structure for _id
      const groupFields: Record<string, any> = {};
      groupby.forEach(item => {
        if (typeof item === 'object') {
          let field = '';
          // Type 1: { column: 'field' }
          if (item.column) {
            field = this.processFieldName(item.column);
          } 
          // Type 2: { type: 'column_ref', column: 'field' }
          else if (item.type === 'column_ref' && item.column) {
            field = this.processFieldName(item.column);
          }
          // Type 3: { expr: { column: 'field' } }
          else if (item.expr && item.expr.column) {
            field = this.processFieldName(item.expr.column);
          }
          
          if (field) {
            groupFields[field] = `$${field}`;
          }
        }
      });
      
      group = {
        _id: groupFields
      };
    }
    
    // Add aggregations for other columns
    if (columns && Array.isArray(columns)) {
      columns.forEach(column => {
        if (typeof column === 'object') {
          // Check for aggregation functions like COUNT, SUM, AVG, etc.
          if (column.expr && column.expr.type && 
              (column.expr.type === 'function' || column.expr.type === 'aggr_func')) {
            
            const funcName = column.expr.name.toLowerCase();
            const args = column.expr.args && column.expr.args.expr ? 
                         column.expr.args.expr : 
                         column.expr.args;
            
            let field = '*';
            if (args && args.column) {
              field = this.processFieldName(args.column);
            } else if (args && args.type === 'star') {
              // COUNT(*) case
              field = '*';
            }
            
            // Use the specified alias or create one
            let alias = column.as || `${funcName}_${field}`;
            
            // Map SQL functions to MongoDB aggregation operators
            switch (funcName) {
              case 'count':
                group[alias] = { $sum: 1 };
                break;
              case 'sum':
                group[alias] = { $sum: `$${field}` };
                break;
              case 'avg':
                group[alias] = { $avg: `$${field}` };
                break;
              case 'min':
                group[alias] = { $min: `$${field}` };
                break;
              case 'max':
                group[alias] = { $max: `$${field}` };
                break;
            }
          } else if (column.expr && column.expr.type === 'column_ref') {
            // Include GROUP BY fields directly in the results
            const field = this.processFieldName(column.expr.column);
            
            // Only add if this is one of our group by fields
            const isGroupByField = groupby.some(g => {
              if (typeof g === 'object') {
                if (g.column) {
                  return g.column === column.expr.column;
                } else if (g.type === 'column_ref' && g.column) {
                  return g.column === column.expr.column;
                } else if (g.expr && g.expr.column) {
                  return g.expr.column === column.expr.column;
                }
              }
              return false;
            });
            
            if (isGroupByField) {
              // Use $first to just take the first value from each group
              // since all values in the group should be the same for this field
              group[field] = { $first: `$${field}` };
            }
          }
        }
      });
    }
    
    log('Generated group stage:', JSON.stringify(group, null, 2));
    return group;
  }
  
  /**
   * Create a MongoDB aggregation pipeline from a FindCommand
   */
  private createAggregatePipeline(command: FindCommand): Record<string, any>[] {
    const pipeline: Record<string, any>[] = [];
    
    // Start with $match if we have a filter
    if (command.filter) {
      pipeline.push({ $match: command.filter });
    }
    
    // Add $lookup stages for JOINs
    if (command.lookup && command.lookup.length > 0) {
      command.lookup.forEach(lookup => {
        pipeline.push({
          $lookup: {
            from: lookup.from,
            localField: lookup.localField,
            foreignField: lookup.foreignField,
            as: lookup.as
          }
        });
        
        // Add $unwind stage to flatten the joined array
        pipeline.push({
          $unwind: {
            path: "$" + lookup.as,
            preserveNullAndEmptyArrays: true
          }
        });
      });
    }
    
    // Add $group stage if grouping is requested
    if (command.group) {
      pipeline.push({ $group: command.group });
    }
    
    // Add $sort if sort is specified
    if (command.sort) {
      pipeline.push({ $sort: command.sort });
    }
    
    // Add $skip if skip is specified
    if (command.skip) {
      pipeline.push({ $skip: command.skip });
    }
    
    // Add $limit if limit is specified
    if (command.limit) {
      pipeline.push({ $limit: command.limit });
    }
    
    // Add $project if projection is specified
    if (command.projection && Object.keys(command.projection).length > 0) {
      const projectionFormat = this.needsAggregationProjection(command.projection)
        ? this.convertToAggregationProjection(command.projection)
        : command.projection;
      pipeline.push({ $project: projectionFormat });
    }
    
    log('Generated aggregate pipeline:', JSON.stringify(pipeline, null, 2));
    return pipeline;
  }

  /**
   * Check if projection needs to be converted to $project format
   */
  private needsAggregationProjection(projection: Record<string, any>): boolean {
    // Check if any value is a string that starts with $
    return Object.values(projection).some(
      value => typeof value === 'string' && value.startsWith('$')
    );
  }

  /**
   * Convert a MongoDB projection to $project format used in aggregation pipeline
   */
  private convertToAggregationProjection(projection: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(projection)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // This is a field reference, keep it as is
        result[key] = value;
      } else if (value === 1) {
        // For 1 values, keep as 1 for MongoDB's $project stage
        result[key] = 1;
      } else {
        // Otherwise, keep as is
        result[key] = value;
      }
    }
    return result;
  }
  
  /**
   * Convert SQL JOINs to MongoDB $lookup stages
   */
  private convertJoins(from: any[], where: any): { from: string; localField: string; foreignField: string; as: string }[] {
    if (!from || !Array.isArray(from) || from.length <= 1) {
      return [];
    }
    
    log('Converting JOINs:', JSON.stringify(from, null, 2));
    log('With WHERE:', JSON.stringify(where, null, 2));
    
    const lookups: { from: string; localField: string; foreignField: string; as: string }[] = [];
    const mainTable = this.extractTableName(from[0]);
    
    // Extract join conditions from the WHERE clause
    // This is a simplification that assumes the ON conditions are in the WHERE clause
    const joinConditions = this.extractJoinConditions(where, from);
    
    // Process each table after the first one (the main table)
    for (let i = 1; i < from.length; i++) {
      const joinedTable = this.extractTableName(from[i]);
      const alias = from[i].as || joinedTable;
      
      // Look for JOIN condition for this table
      const joinCond = joinConditions.find(
        cond => (cond.leftTable === mainTable && cond.rightTable === joinedTable) ||
               (cond.leftTable === joinedTable && cond.rightTable === mainTable)
      );
      
      if (joinCond) {
        const localField = joinCond.leftTable === mainTable ? joinCond.leftField : joinCond.rightField;
        const foreignField = joinCond.leftTable === mainTable ? joinCond.rightField : joinCond.leftField;
        
        lookups.push({
          from: joinedTable,
          localField,
          foreignField,
          as: alias
        });
      } else {
        // If no explicit join condition was found, assume it's a cross join
        // or guess based on common naming conventions (e.g., userId -> _id)
        let localField = '_id';
        let foreignField = `${mainTable.toLowerCase().replace(/s$/, '')}Id`;
        
        lookups.push({
          from: joinedTable,
          localField,
          foreignField,
          as: alias
        });
      }
    }
    
    log('Generated lookups:', JSON.stringify(lookups, null, 2));
    return lookups;
  }
  
  /**
   * Extract join conditions from the WHERE clause
   */
  private extractJoinConditions(where: any, tables: any[]): Array<{
    leftTable: string;
    leftField: string;
    rightTable: string;
    rightField: string;
  }> {
    if (!where) {
      return [];
    }
    
    const tableNames = tables.map(t => {
      if (typeof t === 'string') return t;
      return t.table;
    });
    
    const conditions: Array<{
      leftTable: string;
      leftField: string;
      rightTable: string;
      rightField: string;
    }> = [];
    
    // For equality comparisons in the WHERE clause that reference different tables
    if (where.type === 'binary_expr' && where.operator === '=') {
      if (where.left && where.left.type === 'column_ref' && where.left.table &&
          where.right && where.right.type === 'column_ref' && where.right.table) {
        
        const leftTable = where.left.table;
        const leftField = where.left.column;
        const rightTable = where.right.table;
        const rightField = where.right.column;
        
        if (tableNames.includes(leftTable) && tableNames.includes(rightTable)) {
          conditions.push({
            leftTable,
            leftField,
            rightTable,
            rightField
          });
        }
      }
    } 
    // For AND conditions, recursively extract join conditions from both sides
    else if (where.type === 'binary_expr' && where.operator === 'AND') {
      const leftConditions = this.extractJoinConditions(where.left, tables);
      const rightConditions = this.extractJoinConditions(where.right, tables);
      conditions.push(...leftConditions, ...rightConditions);
    }
    
    return conditions;
  }
}