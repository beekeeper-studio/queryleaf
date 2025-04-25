import {
  SqlCompiler,
  SqlStatement,
  Command,
  FindCommand,
  InsertCommand,
  UpdateCommand,
  DeleteCommand,
  AggregateCommand,
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
  // Store the current SQL statement metadata for use in helper methods
  private currentStatementMetadata: any;

  // Store table aliases from FROM clause
  private currentTableAliases: Map<string, string> = new Map();

  compile(statement: SqlStatement): Command[] {
    const ast = statement.ast;

    // Access statement metadata which includes the nested field replacements
    this.currentStatementMetadata = statement.metadata;
    log('Statement metadata:', JSON.stringify(this.currentStatementMetadata, null, 2));

    log('Compiling SQL AST:', JSON.stringify(ast, null, 2));

    // Reset table aliases for this new statement
    this.currentTableAliases = new Map();

    // Extract table aliases for all statement types that have FROM clause or table references
    if (ast.type === 'select' && ast.from) {
      // Extract aliases from SELECT FROM clause
      for (const fromItem of ast.from) {
        if (fromItem.as) {
          this.currentTableAliases.set(fromItem.as, fromItem.table);
          log(`Found table alias in SELECT: ${fromItem.as} -> ${fromItem.table}`);
        }
      }
    } else if (ast.type === 'update' && ast.table) {
      // Extract aliases from UPDATE table clause
      for (const tableItem of ast.table) {
        if (tableItem.as) {
          this.currentTableAliases.set(tableItem.as, tableItem.table);
          log(`Found table alias in UPDATE: ${tableItem.as} -> ${tableItem.table}`);
        }
      }
    } else if (ast.type === 'delete' && ast.from) {
      // Extract aliases from DELETE FROM clause
      for (const fromItem of ast.from) {
        if (fromItem.as) {
          this.currentTableAliases.set(fromItem.as, fromItem.table);
          log(`Found table alias in DELETE: ${fromItem.as} -> ${fromItem.table}`);
        }
      }
    }

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
   * Extract limit and offset values from an AST
   */
  private extractLimitOffset(ast: any): { limit?: number; skip?: number } {
    const result: { limit?: number; skip?: number } = {};

    if (!ast.limit) return result;

    log('Extracting limit/offset from AST:', JSON.stringify(ast.limit, null, 2));

    if (typeof ast.limit === 'object' && 'value' in ast.limit && !Array.isArray(ast.limit.value)) {
      // Standard LIMIT format (without OFFSET)
      result.limit = Number(ast.limit.value);
    } else if (
      typeof ast.limit === 'object' &&
      'seperator' in ast.limit &&
      Array.isArray(ast.limit.value) &&
      ast.limit.value.length > 0
    ) {
      // Handle PostgreSQL style LIMIT [OFFSET]
      if (ast.limit.seperator === 'offset') {
        if (ast.limit.value.length === 1) {
          // Only OFFSET specified
          result.skip = Number(ast.limit.value[0].value);
        } else if (ast.limit.value.length >= 2) {
          // Both LIMIT and OFFSET
          result.limit = Number(ast.limit.value[0].value);
          result.skip = Number(ast.limit.value[1].value);
        }
      } else {
        // Just LIMIT
        result.limit = Number(ast.limit.value[0].value);
      }
    }

    return result;
  }

  /**
   * Extract field path from a column object
   */
  private extractFieldPath(column: any): string {
    let fieldPath = '';

    if (typeof column === 'string') {
      return this.processFieldName(column);
    }

    if (typeof column !== 'object') return '';

    // Extract field path from different column formats
    if ('expr' in column && column.expr) {
      // Special case for specs.size.diagonal where it appears as schema: specs, column: size.diagonal
      if (column.expr.schema && column.expr.column && column.expr.column.includes('.')) {
        fieldPath = `${column.expr.schema}.${column.expr.column}`;
        log(`Found multi-level nested field with schema: ${fieldPath}`);
      }
      // Handle table.column aliases in expr.column form
      else if (column.expr.table && column.expr.column) {
        fieldPath = `${column.expr.table}.${column.expr.column}`;
        log(`Found table.column alias in expr: ${fieldPath}`);
      } else if ('column' in column.expr && column.expr.column) {
        fieldPath = this.processFieldName(column.expr.column);
      } else if (column.expr.type === 'column_ref' && column.expr.column) {
        // Check for table alias
        if (column.expr.table && column.expr.column) {
          fieldPath = `${column.expr.table}.${column.expr.column}`;
          log(`Found table.column alias in column_ref: ${fieldPath}`);
        }
        // Also check for schema in column_ref
        else if (column.expr.schema && column.expr.column.includes('.')) {
          fieldPath = `${column.expr.schema}.${column.expr.column}`;
          log(`Found multi-level nested field in column_ref: ${fieldPath}`);
        } else {
          fieldPath = this.processFieldName(column.expr.column);
        }
      } else if (column.expr.type === 'binary_expr' && column.expr.operator === '.') {
        // This case should have been handled by handleNestedFieldExpressions
        // But as a fallback, try to extract the path
        log(
          'Binary expression in projection that should have been processed:',
          JSON.stringify(column.expr, null, 2)
        );

        if (
          column.expr.left &&
          column.expr.left.column &&
          column.expr.right &&
          column.expr.right.column
        ) {
          fieldPath = `${column.expr.left.column}.${column.expr.right.column}`;
        }
        // Handle table.column aliases in binary expression
        else if (
          column.expr.left &&
          column.expr.left.type === 'column_ref' &&
          column.expr.left.table &&
          column.expr.left.column &&
          column.expr.right &&
          column.expr.right.type === 'column_ref' &&
          column.expr.right.column
        ) {
          fieldPath = `${column.expr.left.table}.${column.expr.left.column}.${column.expr.right.column}`;
          log(`Found complex table.column.subfield in binary expr: ${fieldPath}`);
        }
      }
    } else if ('type' in column && column.type === 'column_ref' && column.column) {
      // Check for table alias in direct column_ref
      if (column.table && column.column) {
        fieldPath = `${column.table}.${column.column}`;
        log(`Found table.column alias in direct column_ref: ${fieldPath}`);
      }
      // Check for schema in direct column_ref
      else if (column.schema && column.column.includes('.')) {
        fieldPath = `${column.schema}.${column.column}`;
        log(`Found multi-level nested field in column type: ${fieldPath}`);
      } else {
        fieldPath = this.processFieldName(column.column);
      }
    } else if ('column' in column) {
      // Check for table alias in simple column
      if (column.table && column.column) {
        fieldPath = `${column.table}.${column.column}`;
        log(`Found table.column alias in direct column: ${fieldPath}`);
      }
      // Check for schema in simple column
      else if (column.schema && column.column.includes('.')) {
        fieldPath = `${column.schema}.${column.column}`;
        log(`Found multi-level nested field in direct column: ${fieldPath}`);
      } else {
        fieldPath = this.processFieldName(column.column);
      }
    }

    return fieldPath;
  }

  /**
   * Add a field to a MongoDB projection object
   */
  private addFieldToProjection(projection: Record<string, any>, fieldPath: string): void {
    if (!fieldPath) return;

    log(`Processing field path for projection: ${fieldPath}`);

    // If the field path contains a period, check if it's a table alias reference or a nested field
    if (fieldPath.includes('.')) {
      const parts = fieldPath.split('.');
      const prefix = parts[0];

      // Check if the prefix is a table alias that we identified in the FROM clause
      if (this.currentTableAliases.has(prefix)) {
        // This is a table alias reference, extract just the field name
        const actualField = parts.slice(1).join('.');
        log(`Identified table alias in projection: ${prefix} -> ${actualField}`);

        // Add to projection with just the field name - no $first for regular fields
        projection[actualField] = 1;
      } else {
        // This is a nested field
        // For nested fields, create a name with underscores instead of dots
        const fieldNameWithUnderscores = fieldPath.replace(/\./g, '_');

        // Add to projection with the path-based name - use $ syntax for field reference
        projection[fieldNameWithUnderscores] = `$${fieldPath}`;
        log(`Added nested field to projection: ${fieldNameWithUnderscores} = $${fieldPath}`);

        // Also include the last part as a fallback
        const lastPart = parts[parts.length - 1];
        projection[lastPart] = 1;
      }
    } else {
      // Regular field
      projection[fieldPath] = 1;
    }
  }

  /**
   * Compile a SELECT statement into a MongoDB FIND command or AGGREGATE command
   */
  private compileSelect(ast: any): FindCommand | AggregateCommand {
    if (!ast.from || !Array.isArray(ast.from) || ast.from.length === 0) {
      throw new Error('FROM clause is required for SELECT statements');
    }

    const collection = this.extractTableName(ast.from[0]);

    // Check if we have nested field projections
    const hasNestedFieldProjections =
      ast.columns &&
      Array.isArray(ast.columns) &&
      ast.columns.some((col: any) => {
        if (typeof col === 'object') {
          // Various ways to detect nested fields
          if (col.expr?.column?.includes('.')) return true;
          if (col.expr?.type === 'column_ref' && col.expr?.column?.includes('.')) return true;
          if (col.expr?.type === 'binary_expr' && col.expr?.operator === '.') return true;
          if (col.column?.includes('.')) return true;
        } else if (typeof col === 'string' && col.includes('.')) {
          return true;
        }
        return false;
      });

    // Check if we need to use aggregate pipeline
    const needsAggregation =
      hasNestedFieldProjections ||
      (ast.columns && Array.isArray(ast.columns) && ast.columns.some((col: any) => col.as)) || // Has aliases
      ast.groupby ||
      (ast.from && ast.from.length > 1); // Has JOINs

    log('Needs aggregation:', needsAggregation, 'hasNestedFields:', hasNestedFieldProjections);

    if (needsAggregation) {
      // For queries with nested fields, we need to use the aggregate pipeline
      // to properly handle extracting nested fields to the top level
      const aggregateCommand: AggregateCommand = {
        type: 'AGGREGATE',
        collection,
        pipeline: [],
      };

      // Start with $match if we have a filter
      if (ast.where) {
        aggregateCommand.pipeline.push({ $match: this.convertWhere(ast.where) });
      }

      // Handle JOINs
      if (ast.from && ast.from.length > 1) {
        const lookups = this.convertJoins(ast.from, ast.where);
        lookups.forEach((lookup) => {
          aggregateCommand.pipeline.push({
            $lookup: {
              from: lookup.from,
              localField: lookup.localField,
              foreignField: lookup.foreignField,
              as: lookup.as,
            },
          });

          // Add unwind stage for the joined collection
          aggregateCommand.pipeline.push({
            $unwind: {
              path: '$' + lookup.as,
              preserveNullAndEmptyArrays: true,
            },
          });

          // Store fields to promote from joined table
          const joinFieldMapping: Record<string, any> = {};

          // We need a flag to check if we have a SELECT * query
          const hasStar =
            ast.columns &&
            ast.columns.some(
              (col) =>
                col === '*' || (typeof col === 'object' && col.expr && col.expr.type === 'star')
            );

          // Process explicit columns first
          if (ast.columns && !hasStar) {
            for (const column of ast.columns) {
              if (
                typeof column === 'object' &&
                column.expr &&
                column.expr.table &&
                column.expr.column
              ) {
                const table = column.expr.table;
                const field = column.expr.column;

                // Get the output field name (use alias if provided)
                const outputName = column.as || field;

                // If this field is from the joined table that we're currently processing
                if (table === lookup.as) {
                  // Map the joined field to the top level with proper name
                  joinFieldMapping[outputName] = `$${lookup.as}.${field}`;
                  log(`Explicit field mapping: ${outputName} = $${lookup.as}.${field}`);
                }
              }
            }
          }

          // If we have a SELECT * or no explicit joined fields were found,
          // we need to promote ALL fields from the joined collection
          if (hasStar || Object.keys(joinFieldMapping).length === 0) {
            // For SELECT *, we add a dedicated stage to promote ALL fields from the joined table
            // Use $addFields with $map to dynamically extract all fields
            aggregateCommand.pipeline.push({
              $replaceRoot: {
                newRoot: {
                  $mergeObjects: ['$$ROOT', `$${lookup.as}`],
                },
              },
            });
            log(`Added $replaceRoot with $mergeObjects to flatten ALL fields from ${lookup.as}`);

            // After merging, remove the original nested object
            aggregateCommand.pipeline.push({
              $project: {
                [lookup.as]: 0,
              },
            });
            log(`Added $project to remove original nested object ${lookup.as}`);
          } else {
            // For explicit field selection, add fields stage to bring joined fields up to top level
            aggregateCommand.pipeline.push({
              $addFields: joinFieldMapping,
            });
            log(
              `Added $addFields stage for explicit joined fields: ${JSON.stringify(joinFieldMapping, null, 2)}`
            );

            // Then exclude the nested joined document to prevent duplication
            aggregateCommand.pipeline.push({
              $project: {
                [lookup.as]: 0,
              },
            });
            log(`Added $project stage to exclude nested joined document: ${lookup.as}`);
          }
        });
      }

      // Handle GROUP BY
      if (ast.groupby) {
        const group = this.convertGroupBy(ast.groupby, ast.columns);
        if (group) {
          aggregateCommand.pipeline.push({ $group: group });
        }
      }

      // Handle ORDER BY
      if (ast.orderby) {
        aggregateCommand.pipeline.push({ $sort: this.convertOrderBy(ast.orderby) });
      }

      // Handle LIMIT and OFFSET
      const { limit, skip } = this.extractLimitOffset(ast);
      if (skip !== undefined) {
        aggregateCommand.pipeline.push({ $skip: skip });
      }
      if (limit !== undefined) {
        aggregateCommand.pipeline.push({ $limit: limit });
      }

      // Add projection for SELECT columns
      if (ast.columns) {
        const projection: Record<string, any> = {};

        // For JOIN queries, we need to handle nested paths differently
        const isJoinQuery = ast.from && ast.from.length > 1;

        // Handle each column in the projection
        for (const column of ast.columns) {
          if (
            column === '*' ||
            (typeof column === 'object' && column.expr && column.expr.type === 'star')
          ) {
            // Select all fields - no specific projection needed in MongoDB
            continue;
          }

          // Handle aggregate functions specially in projection
          if (
            typeof column === 'object' &&
            column.expr &&
            (column.expr.type === 'aggr_func' || column.expr.type === 'function')
          ) {
            if (column.as) {
              // If this is an aggregate function with an alias, preserve it in projection
              log(`Found aggregate function with alias: ${column.as}`);

              // For aggregates, just pass the value through directly from the group stage
              projection[column.as] = 1;
            }
            continue;
          }

          const fieldPath = this.extractFieldPath(column);

          // Check if this column has an alias
          if (typeof column === 'object' && column.as) {
            // If column has an alias, use it for projection
            log(`Found column alias: ${column.as} for field: ${fieldPath}`);

            if (fieldPath.includes('.')) {
              // If it's a table alias reference, extract actual field
              const parts = fieldPath.split('.');
              const prefix = parts[0];

              if (this.currentTableAliases.has(prefix)) {
                // This is a field referenced via table alias (e.g., c.name)
                const actualField = parts.slice(1).join('.');

                if (isJoinQuery) {
                  // In JOIN queries, references to aliased tables need to be mapped to the lookup path
                  // Example: c.name should become $c.name where c is the alias for the "customers" collection
                  projection[column.as] = `$${prefix}.${actualField}`;
                  log(`JOIN query - added aliased field: ${column.as} = $${prefix}.${actualField}`);
                } else {
                  // In non-JOIN queries, we can directly access the field
                  projection[column.as] = `$${actualField}`;
                  // Also include the actual field in the projection to ensure it's available
                  projection[actualField] = 1;
                  log(
                    `Added aliased field to projection: ${column.as} = $${actualField}, including ${actualField}`
                  );
                }
              } else {
                // Nested field with alias
                projection[column.as] = `$${fieldPath}`;
                log(`Added aliased nested field to projection: ${column.as} = $${fieldPath}`);
              }
            } else {
              // Regular field with alias
              projection[column.as] = `$${fieldPath}`;
              log(`Added aliased field to projection: ${column.as} = $${fieldPath}`);
            }
          } else {
            // No alias, use standard projection
            this.addFieldToProjection(projection, fieldPath);
          }
        }

        // For JOIN queries, we need a special handling
        if (isJoinQuery) {
          // Add detailed debugging for JOIN queries
          log('================ JOIN QUERY DEBUG ================');
          log('JOIN query columns:', JSON.stringify(ast.columns, null, 2));
          log('JOIN query from:', JSON.stringify(ast.from, null, 2));
          log('JOIN query where:', JSON.stringify(ast.where, null, 2));

          // Add the $lookup stages we've already configured
          const lookupStages = aggregateCommand.pipeline.filter((stage) => '$lookup' in stage);
          log('Current $lookup stages:', JSON.stringify(lookupStages, null, 2));

          // For JOIN queries, we need to handle the projection differently to flatten the results
          // First, we'll create a projection that preserves the table aliases in the pipeline
          const renamedFieldsProject: Record<string, any> = {};

          // Process each column and create a flattened naming structure
          for (const column of ast.columns) {
            if (typeof column === 'object' && column.expr) {
              const table = column.expr.table;
              const field = column.expr.column;

              // The field name that will be used in the output
              // If there's an alias, use it, otherwise use just the field name
              const outputName = column.as || field;

              if (table) {
                // Different handling based on whether it's from the main table or a joined table
                if (this.currentTableAliases.has(table)) {
                  const isMainTable = table === ast.from[0].as;

                  if (isMainTable) {
                    // Fields from the main table can be accessed directly
                    renamedFieldsProject[outputName] = `$${field}`;
                    log(`Main table field mapping: ${outputName} = $${field}`);
                  } else {
                    // Fields from joined tables need the alias prefix
                    renamedFieldsProject[outputName] = `$${table}.${field}`;
                    log(`Joined table field mapping: ${outputName} = $${table}.${field}`);
                  }
                } else {
                  // Not a recognized alias, but still has a table prefix
                  renamedFieldsProject[outputName] = `$${table}.${field}`;
                }
              } else if (column.expr.type === 'column_ref' && column.expr.column) {
                // Handle case where column is a direct column reference without table
                // For JOINS, we still need to know which table it belongs to

                // If no table specified, try to determine which table it belongs to
                // For simplicity, assume it's from the main table
                renamedFieldsProject[outputName] = `$${column.expr.column}`;
                log(`Simple column mapping: ${outputName} = $${column.expr.column}`);
              } else {
                // No table prefix specified, assume it's from the main table
                renamedFieldsProject[outputName] = `$${field}`;
              }
            } else if (
              column === '*' ||
              (typeof column === 'object' && column.expr && column.expr.type === 'star')
            ) {
              // For SELECT *, we need to merge all fields from all tables
              // This is a more complex case that needs a special projection approach

              // For star queries in JOIN context, we need to use MongoDB's $mergeObjects
              // to bring fields from joined documents up to the top level

              // First, create a base object with all fields from the main table
              renamedFieldsProject['mainFields'] = '$$ROOT';

              // Then, for each joined table, create a merge field
              for (let i = 1; i < ast.from.length; i++) {
                const joinedTable = ast.from[i].as || this.extractTableName(ast.from[i]);
                // Use all fields from the joined table, directly available at the top level
                // This preserves their original field names
                renamedFieldsProject[joinedTable] = `$${joinedTable}`;
              }

              // Use MongoDB's $replaceRoot to promote all fields to the root level
              // This will be a separate stage after the projection
              const mergeObjects = ['$mainFields'];
              for (let i = 1; i < ast.from.length; i++) {
                const joinedTable = ast.from[i].as || this.extractTableName(ast.from[i]);
                mergeObjects.push(`$${joinedTable}`);
              }

              // We will add the $replaceRoot stage after this projection
              aggregateCommand.pipeline.push({
                $replaceRoot: {
                  newRoot: {
                    $mergeObjects: mergeObjects,
                  },
                },
              });

              log('Added $replaceRoot stage for merging joined tables in SELECT *');
            }
          }

          // Add a final stage to correctly handle JOIN results
          // We need the column values to be accessible directly at the top level,
          // without requiring table alias prefixes

          if (ast.from.length > 1) {
            log('====== DEBUG JOIN PROCESSING ======');
            log(
              'JOIN query structure:',
              JSON.stringify(
                {
                  columns: ast.columns,
                  from: ast.from,
                  currentPipeline: aggregateCommand.pipeline,
                },
                null,
                2
              )
            );

            // For JOIN queries, we need to flatten the results
            const addFieldsStage: Record<string, any> = {};

            // Detailed output of each column being processed
            ast.columns.forEach((column, idx) => {
              log(`Column ${idx} details:`, JSON.stringify(column, null, 2));
            });

            // For each column in the query
            for (const column of ast.columns) {
              if (typeof column === 'object' && column.expr) {
                const table = column.expr.table;
                const field = column.expr.column;

                log(`Processing JOIN column: table=${table}, field=${field}`);

                if (table && field && this.currentTableAliases.has(table)) {
                  // Output field name (possibly aliased)
                  const outputField = column.as || field;

                  // Create a path to the field, which could be in the root doc or nested
                  // in a joined doc (like "o.product")
                  // The key fix: Use proper MongoDB dot notation for accessing fields
                  // Fields from main table can be accessed directly, fields from joined tables need the alias prefix
                  let sourcePath;

                  if (table === ast.from[0].as) {
                    // Field from main table can be accessed directly
                    sourcePath = `$${field}`;
                    log(`Main table field path: $${field}`);
                  } else {
                    // Field from joined table (came from $lookup and $unwind)
                    // MongoDB dot notation for accessing nested document fields
                    sourcePath = `$${table}.${field}`;
                    log(`Joined table field path: $${table}.${field}`);
                  }

                  // Add this field mapping
                  addFieldsStage[outputField] = sourcePath;
                  log(`JOIN: Creating flat field ${outputField} = ${sourcePath}`);
                } else {
                  log(
                    `Skipped column - missing table alias or field: ${JSON.stringify(column, null, 2)}`
                  );
                }
              } else {
                log(`Non-object column structure:`, JSON.stringify(column, null, 2));
              }
            }

            // Dump the current aliases for debugging
            log('Current table aliases:', Object.fromEntries(this.currentTableAliases.entries()));

            // Add the $addFields stage to make all fields available at the top level
            if (Object.keys(addFieldsStage).length > 0) {
              log('Adding $addFields stage for JOIN:', JSON.stringify(addFieldsStage, null, 2));

              // Before adding, print the current pipeline
              log(
                'Pipeline before adding $addFields:',
                JSON.stringify(aggregateCommand.pipeline, null, 2)
              );

              // Add the $addFields stage
              aggregateCommand.pipeline.push({ $addFields: addFieldsStage });

              // Direct fix for the product/price field coming from a JOIN
              // We'll extract the exact fields we need from the joined document
              const joinFieldMapping: Record<string, any> = {};

              // Loop through columns to specifically handle JOIN fields
              ast.columns.forEach((column: any) => {
                if (
                  typeof column === 'object' &&
                  column.expr &&
                  column.expr.table &&
                  column.expr.column
                ) {
                  const table = column.expr.table;
                  const field = column.expr.column;

                  // Only process fields from joined tables (not from main table)
                  if (this.currentTableAliases.has(table) && table !== ast.from[0].as) {
                    // This is a field coming from a joined table
                    const outputName = column.as || field;

                    // Map it directly from the nested document to the top level
                    joinFieldMapping[outputName] = `$${table}.${field}`;
                    log(`Mapping joined field to top level: ${outputName} = $${table}.${field}`);
                  }
                }
              });

              // Add the $addFields stage to bring JOIN fields to top level
              if (Object.keys(joinFieldMapping).length > 0) {
                log(
                  'Adding $addFields stage for JOIN field mapping:',
                  JSON.stringify(joinFieldMapping, null, 2)
                );
                aggregateCommand.pipeline.push({
                  $addFields: joinFieldMapping,
                });
              }

              // Now we need to exclude the joined table objects since their fields are flattened
              // This makes the output match what SQL would normally return
              const excludeJoinedDocs: Record<string, any> = {};

              // First, indicate that we want to keep everything
              excludeJoinedDocs['_id'] = 1;

              // Set merged fields to be kept
              for (const [field, _] of Object.entries(joinFieldMapping)) {
                excludeJoinedDocs[field] = 1;
              }

              // Include all base table fields (they're already at the root level)
              for (const column of ast.columns) {
                if (typeof column === 'object' && column.expr) {
                  const table = column.expr.table;
                  const field = column.expr.column;

                  if (table === ast.from[0].as || !table) {
                    // Main table field or direct field reference
                    const outputName = column.as || field;
                    excludeJoinedDocs[outputName] = 1;
                  }
                }
              }

              // Now specifically exclude the nested documents to prevent duplication
              for (const fromItem of ast.from) {
                if (fromItem.as && fromItem.as !== ast.from[0].as) {
                  // Exclude the joined document fields that were flattened
                  excludeJoinedDocs[fromItem.as] = 0;
                }
              }

              log(
                'Adding $project stage to exclude nested docs:',
                JSON.stringify(excludeJoinedDocs, null, 2)
              );
              aggregateCommand.pipeline.push({ $project: excludeJoinedDocs });

              // After adding, print the full pipeline
              log(
                'Final pipeline after JOIN processing:',
                JSON.stringify(aggregateCommand.pipeline, null, 2)
              );
            } else {
              log('No fields added to $addFields stage - skipping projection stages');
            }
          }
        }
        // For non-JOIN queries, use the standard projection
        else if (Object.keys(projection).length > 0) {
          log('Standard projection stage:', JSON.stringify(projection, null, 2));
          aggregateCommand.pipeline.push({ $project: projection });
        }
      }

      log('Aggregate pipeline:', JSON.stringify(aggregateCommand.pipeline, null, 2));
      return aggregateCommand;
    } else {
      // Use regular FIND command for simple queries without nested fields
      const findCommand: FindCommand = {
        type: 'FIND',
        collection,
        filter: ast.where ? this.convertWhere(ast.where) : undefined,
        projection: ast.columns ? this.convertColumns(ast.columns) : undefined,
      };

      // Handle LIMIT and OFFSET
      const { limit, skip } = this.extractLimitOffset(ast);
      if (limit !== undefined) findCommand.limit = limit;
      if (skip !== undefined) findCommand.skip = skip;

      // Handle ORDER BY
      if (ast.orderby) {
        findCommand.sort = this.convertOrderBy(ast.orderby);
      }

      return findCommand;
    }
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
      documents,
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

    log('Processing UPDATE AST:', JSON.stringify(ast, null, 2));

    // First, identify and handle multi-level nested fields in the SET clause
    this.handleUpdateNestedFields(ast.set);

    const update: Record<string, any> = {};

    ast.set.forEach((setItem: any) => {
      if (setItem.column && setItem.value) {
        let fieldName;

        // Check for special placeholder format from parser
        if (setItem.column.startsWith('__NESTED_') && setItem.column.endsWith('__')) {
          // This is a placeholder for a multi-level nested field
          // Extract the index from the placeholder
          const placeholderIndex = parseInt(
            setItem.column.replace('__NESTED_', '').replace('__', '')
          );

          // Get the original nested field path from the parser replacements
          // This requires accessing the parser's replacements, which we don't have direct access to
          // Instead, we'll need to restore it through other means

          // Extract the original nested field path using metadata from the statement

          // Get the metadata with nested field replacements from the statement
          const nestedFieldReplacements = this.currentStatementMetadata?.nestedFieldReplacements;

          // Check if we have metadata containing the field replacements
          if (nestedFieldReplacements && nestedFieldReplacements.length > placeholderIndex) {
            const [_, originalField] = nestedFieldReplacements[placeholderIndex];
            fieldName = originalField;
            log(`Restored nested field from metadata: ${setItem.column} -> ${fieldName}`);
          } else {
            // Fallback to using the placeholder itself if we can't restore it
            fieldName = setItem.column;
            log(`Could not restore nested field, using placeholder: ${fieldName}`);
          }
        }
        // Special handling for nested fields in UPDATE statements
        else if (setItem.table) {
          // Check if this is part of a multi-level nested field
          if (setItem.schema) {
            // This is a multi-level nested field with schema.table.column structure
            fieldName = `${setItem.schema}.${setItem.table}.${setItem.column}`;
            log(`Reconstructed multi-level nested field: ${fieldName}`);
          } else {
            // This is a standard nested field with table.column structure
            // Check if the table part is a registered alias
            if (this.currentTableAliases.has(setItem.table)) {
              // This is a table alias, use just the column name
              fieldName = setItem.column;
              log(`Found alias in UPDATE SET: ${setItem.table}.${setItem.column} -> ${fieldName}`);
            } else {
              // This is a nested field path
              fieldName = `${setItem.table}.${setItem.column}`;
            }
          }
        } else {
          // Process the field name to handle nested fields with dot notation
          fieldName = this.processFieldName(setItem.column);
        }

        log(
          `Setting UPDATE field: ${fieldName} = ${JSON.stringify(this.convertValue(setItem.value))}`
        );
        update[fieldName] = this.convertValue(setItem.value);
      }
    });

    return {
      type: 'UPDATE',
      collection,
      filter: ast.where ? this.convertWhere(ast.where) : undefined,
      update: { $set: update }, // Use $set operator for MongoDB update
    };
  }

  /**
   * Handle multi-level nested fields in UPDATE SET clause
   * This modifies the ast.set items to properly represent deep nested paths
   */
  private handleUpdateNestedFields(setItems: any[]): void {
    if (!setItems || !Array.isArray(setItems)) return;

    log('Processing SET items for nested fields:', JSON.stringify(setItems, null, 2));

    for (let i = 0; i < setItems.length; i++) {
      const item = setItems[i];

      // Check if this is a multi-level nested field (has both schema and table properties)
      if (item.schema && item.table && item.column) {
        log(
          `Found potential multi-level nested field: ${item.schema}.${item.table}.${item.column}`
        );

        // Keep as is - the schema.table.column structure will be handled in compileUpdate
        continue;
      }

      // Check if the table property might actually contain a nested path itself
      if (item.table && item.table.includes('.')) {
        // This is a multi-level nested field where part of the path is in the table property
        const parts = item.table.split('.');
        if (parts.length >= 2) {
          // Assign the first part to schema, and second to table
          item.schema = parts[0];
          item.table = parts.slice(1).join('.');
          log(`Restructured nested field: ${item.schema}.${item.table}.${item.column}`);
        }
      }
    }
  }

  /**
   * Compile a DELETE statement into a MongoDB DELETE command
   */
  private compileDelete(ast: any): DeleteCommand {
    if (!ast.from || !Array.isArray(ast.from) || ast.from.length === 0) {
      throw new Error('FROM clause is required for DELETE statements');
    }

    const collection = this.extractTableName(ast.from[0]);

    // Pre-process the AST to handle nested fields that might be parsed as table references
    // This ensures table aliases are properly handled in WHERE clauses
    this.handleNestedFieldReferences(ast);

    return {
      type: 'DELETE',
      collection,
      filter: ast.where ? this.convertWhere(ast.where) : undefined,
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

    log('Converting WHERE clause:', JSON.stringify(where, null, 2));

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
        // Handle table alias in column reference
        let field;
        if (left.table && left.column) {
          // Check if the table is a registered alias
          if (this.currentTableAliases.has(left.table)) {
            // This is a table alias, use just the field part
            field = left.column;
            log(`Using field from table alias in WHERE: ${left.table}.${left.column} -> ${field}`);
          } else {
            // This is a nested field reference
            field = `${left.table}.${left.column}`;
            log(`Using nested field in WHERE clause: ${field}`);
          }
        } else if (left.column.includes('.')) {
          // Check if it's a field with dot notation that might have an alias prefix
          const parts = left.column.split('.');
          const prefix = parts[0];

          // Check if the prefix is a table alias we identified in the FROM clause
          if (this.currentTableAliases.has(prefix)) {
            // This is a table alias reference, extract just the field name
            field = parts.slice(1).join('.');
            log(`Identified alias in dot notation: ${left.column} -> ${field}`);
          } else {
            // This is a nested field
            field = this.processFieldName(left.column);
          }
        } else {
          field = this.processFieldName(left.column);
        }

        const value = this.convertValue(right);
        const filter: Record<string, any> = {};

        log(`Building filter for ${field} ${operator} ${JSON.stringify(value)}`);

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
            const pattern = String(value).replace(/%/g, '.*').replace(/_/g, '.');
            filter[field] = { $regex: new RegExp(`^${pattern}$`, 'i') };
            break;
          case 'BETWEEN':
            if (Array.isArray(right) && right.length === 2) {
              filter[field] = {
                $gte: this.convertValue(right[0]),
                $lte: this.convertValue(right[1]),
              };
            } else {
              throw new Error('BETWEEN operator expects two values');
            }
            break;
          default:
            throw new Error(`Unsupported operator: ${operator}`);
        }

        log('Produced filter:', JSON.stringify(filter, null, 2));
        return filter;
      }
    } else if (where.type === 'unary_expr') {
      // Handle NOT, IS NULL, IS NOT NULL
      if (
        where.operator === 'IS NULL' &&
        typeof where.expr === 'object' &&
        'column' in where.expr
      ) {
        // Handle table alias in IS NULL
        let field;
        if (where.expr.table && where.expr.column) {
          // Check if the table is a registered alias
          if (this.currentTableAliases.has(where.expr.table)) {
            // This is a table alias, use just the field part
            field = where.expr.column;
            log(
              `Using field from table alias in IS NULL: ${where.expr.table}.${where.expr.column} -> ${field}`
            );
          } else {
            // This is a nested field reference
            field = `${where.expr.table}.${where.expr.column}`;
            log(`Using nested field in IS NULL: ${field}`);
          }
        } else if (where.expr.column.includes('.')) {
          // Check if it's a field with dot notation that might have an alias prefix
          const parts = where.expr.column.split('.');
          const prefix = parts[0];

          // Check if the prefix is a table alias we identified in the FROM clause
          if (this.currentTableAliases.has(prefix)) {
            // This is a table alias reference, extract just the field name
            field = parts.slice(1).join('.');
            log(`Identified alias in IS NULL dot notation: ${where.expr.column} -> ${field}`);
          } else {
            // This is a nested field
            field = this.processFieldName(where.expr.column);
          }
        } else {
          field = this.processFieldName(where.expr.column);
        }

        return { [field]: { $eq: null } };
      } else if (
        where.operator === 'IS NOT NULL' &&
        typeof where.expr === 'object' &&
        'column' in where.expr
      ) {
        // Handle table alias in IS NOT NULL
        let field;
        if (where.expr.table && where.expr.column) {
          // Check if the table is a registered alias
          if (this.currentTableAliases.has(where.expr.table)) {
            // This is a table alias, use just the field part
            field = where.expr.column;
            log(
              `Using field from table alias in IS NOT NULL: ${where.expr.table}.${where.expr.column} -> ${field}`
            );
          } else {
            // This is a nested field reference
            field = `${where.expr.table}.${where.expr.column}`;
            log(`Using nested field in IS NOT NULL: ${field}`);
          }
        } else if (where.expr.column.includes('.')) {
          // Check if it's a field with dot notation that might have an alias prefix
          const parts = where.expr.column.split('.');
          const prefix = parts[0];

          // Check if the prefix is a table alias we identified in the FROM clause
          if (this.currentTableAliases.has(prefix)) {
            // This is a table alias reference, extract just the field name
            field = parts.slice(1).join('.');
            log(`Identified alias in IS NOT NULL dot notation: ${where.expr.column} -> ${field}`);
          } else {
            // This is a nested field
            field = this.processFieldName(where.expr.column);
          }
        } else {
          field = this.processFieldName(where.expr.column);
        }

        return { [field]: { $ne: null } };
      } else if (where.operator === 'NOT') {
        const subFilter = this.convertWhere(where.expr);
        return { $nor: [subFilter] };
      }
    }

    log('Could not parse WHERE clause, returning empty filter');
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
    if (
      columns.some(
        (col) =>
          col === '*' ||
          (typeof col === 'object' && col.expr && col.expr.type === 'star') ||
          (typeof col === 'object' && col.expr && col.expr.column === '*')
      )
    ) {
      log('Star (*) detected, returning empty projection');
      return {};
    }

    columns.forEach((column) => {
      if (typeof column === 'object') {
        if ('expr' in column && column.expr) {
          // Handle dot notation (nested fields)
          if ('column' in column.expr && column.expr.column) {
            // First check if the column has a table reference that might be an alias
            let fieldName;
            if (column.expr.table && column.expr.column) {
              fieldName = `${column.expr.table}.${column.expr.column}`;
              log(`Using table-prefixed field in projection: ${fieldName}`);
            } else {
              fieldName = this.processFieldName(column.expr.column);
            }

            const outputField = column.as || fieldName;
            // For find queries, MongoDB projection uses 1
            projection[fieldName] = 1;

            // For nested fields, also include the parent field
            if (fieldName.includes('.')) {
              const parentField = fieldName.split('.')[0];
              projection[parentField] = 1;
            }
          } else if (column.expr.type === 'column_ref' && column.expr.column) {
            // Handle column_ref with possible table
            let fieldName;
            if (column.expr.table && column.expr.column) {
              fieldName = `${column.expr.table}.${column.expr.column}`;
              log(`Using table-prefixed field in column_ref projection: ${fieldName}`);
            } else {
              fieldName = this.processFieldName(column.expr.column);
            }

            const outputField = column.as || fieldName;
            // For find queries, MongoDB projection uses 1
            projection[fieldName] = 1;

            // For nested fields, also include the parent field
            if (fieldName.includes('.')) {
              const parentField = fieldName.split('.')[0];
              projection[parentField] = 1;
            }
          } else if (
            column.expr.type === 'binary_expr' &&
            column.expr.operator === '.' &&
            column.expr.left &&
            column.expr.right
          ) {
            // Handle explicit dot notation like table.column
            let fieldName = '';
            if (column.expr.left.column) {
              fieldName = column.expr.left.column;

              // Also check if left side has a table (could be alias.field.subfield)
              if (column.expr.left.table) {
                fieldName = `${column.expr.left.table}.${fieldName}`;
              }
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
          // Handle direct column_ref with possible table
          let fieldName;
          if (column.table && column.column) {
            fieldName = `${column.table}.${column.column}`;
            log(`Using table-prefixed field in direct column_ref: ${fieldName}`);
          } else {
            fieldName = this.processFieldName(column.column);
          }

          const outputField = column.as || fieldName;
          // For find queries, MongoDB projection uses 1
          projection[fieldName] = 1;

          // For nested fields, also include the parent field
          if (fieldName.includes('.')) {
            const parentField = fieldName.split('.')[0];
            projection[parentField] = 1;
          }
        } else if ('column' in column) {
          // Handle direct column with possible table
          let fieldName;
          if (column.table && column.column) {
            fieldName = `${column.table}.${column.column}`;
            log(`Using table-prefixed field in direct column: ${fieldName}`);
          } else {
            fieldName = this.processFieldName(column.column);
          }

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
   * Also handles multi-level nested references like "customer.address.city"
   */
  private handleNestedFieldReferences(ast: any): void {
    log('Handling nested field references in AST');

    // Handle column references in SELECT clause
    if (ast.columns && Array.isArray(ast.columns)) {
      log('Raw columns before processing:', JSON.stringify(ast.columns, null, 2));

      // First pass: Handle binary expressions which might be nested field accesses
      this.handleNestedFieldExpressions(ast.columns);

      log('Columns after handling nested expressions:', JSON.stringify(ast.columns, null, 2));

      // Second pass: Handle simple table.column references
      ast.columns.forEach((column: any) => {
        if (
          column.expr &&
          column.expr.type === 'column_ref' &&
          column.expr.table &&
          column.expr.column
        ) {
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
   * Handle binary expressions that might represent multi-level nested field access
   * For example: customer.address.city might be parsed as a binary expression
   * with left=customer.address and right=city, which itself might be left=customer, right=address
   */
  private handleNestedFieldExpressions(columns: any[]): void {
    log('handleNestedFieldExpressions called with columns:', JSON.stringify(columns, null, 2));

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];

      // Check if this is a binary expression with a dot operator
      if (column.expr && column.expr.type === 'binary_expr' && column.expr.operator === '.') {
        log('Found binary expression with dot operator:', JSON.stringify(column.expr, null, 2));

        // Convert the binary expression to a flat column reference with a path string
        column.expr = this.flattenDotExpression(column.expr);
        log(`Flattened nested field expression to: ${column.expr.column}`);
      }
    }
  }

  /**
   * Recursively flattens a dot-notation binary expression into a single column reference
   * For example, a.b.c (which is represented as (a.b).c) is flattened to a column reference "a.b.c"
   */
  private flattenDotExpression(expr: any): any {
    if (expr.type !== 'binary_expr' || expr.operator !== '.') {
      // Not a dot expression, return as is
      return expr;
    }

    // Process left side - it might be another nested dot expression
    let leftPart = '';
    if (expr.left.type === 'binary_expr' && expr.left.operator === '.') {
      // Recursively process the left part
      const flattenedLeft = this.flattenDotExpression(expr.left);
      if (flattenedLeft.type === 'column_ref') {
        leftPart = flattenedLeft.column;
      }
    } else if (expr.left.type === 'column_ref') {
      // Simple column reference
      if (expr.left.table) {
        // If the table part is short (1-2 chars), it's likely an alias
        // We'll keep the table prefix for disambiguation
        if (expr.left.table.length <= 2) {
          log(`Identified likely table alias in binary expr: ${expr.left.table}`);
          leftPart = `${expr.left.table}.${expr.left.column}`;
        } else {
          leftPart = `${expr.left.table}.${expr.left.column}`;
        }
      } else {
        leftPart = expr.left.column;
      }
    } else if (expr.left.column) {
      // Direct column property
      leftPart = expr.left.column;
    }

    // Process right side
    let rightPart = '';
    if (expr.right.type === 'column_ref') {
      rightPart = expr.right.column;
    } else if (expr.right.column) {
      rightPart = expr.right.column;
    } else if (typeof expr.right === 'object' && expr.right.value) {
      // Handle potential case where it's not a column reference but has a value
      rightPart = expr.right.value;
    }

    // Combine to create the full field path
    if (leftPart && rightPart) {
      return {
        type: 'column_ref',
        table: null,
        column: `${leftPart}.${rightPart}`,
      };
    }

    // If we couldn't properly flatten, return the original expression
    return expr;
  }

  /**
   * Process WHERE clause to handle nested field references
   */
  private processWhereClauseForNestedFields(where: any): void {
    if (!where) return;

    log('Processing WHERE clause for nested fields:', JSON.stringify(where, null, 2));

    if (where.type === 'binary_expr') {
      if (where.operator === '.') {
        // This is a nested field access in the form of a.b.c
        // Use our recursive flattener to handle it
        const flattened = this.flattenDotExpression(where);

        // Replace the original binary expression with the flattened one
        Object.assign(where, flattened);

        log('Flattened nested field in WHERE clause:', JSON.stringify(where, null, 2));
      } else {
        // For other binary expressions (like comparisons), process both sides recursively
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
            log(
              'Converting table.column to nested path:',
              `${where.left.table}.${where.left.column}`
            );
            where.left.column = `${where.left.table}.${where.left.column}`;
            where.left.table = null;
          }
        }

        // Also handle right side references for comparison operators
        if (where.right && where.right.type === 'column_ref') {
          log('Processing right-side column reference:', JSON.stringify(where.right, null, 2));

          if (where.right.column && where.right.column.includes('.')) {
            // Already has dot notation, just keep it
            log('Right column already has dot notation:', where.right.column);
          } else if (where.right.table && where.right.column) {
            // Convert table.column format to a nested field path
            log(
              'Converting right-side table.column to nested path:',
              `${where.right.table}.${where.right.column}`
            );
            where.right.column = `${where.right.table}.${where.right.column}`;
            where.right.table = null;
          }
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

    orderby.forEach((item) => {
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
  private convertGroupBy(
    groupby: any[],
    columns: any[]
  ): { _id: any; [key: string]: any } | undefined {
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
          [singleField]: { $first: `$${singleField}` }, // Include the field in results too
        };
      } else {
        // Fallback if we can't extract the field
        group = { _id: null };
      }
    } else {
      // For multiple fields, use the object structure for _id
      const groupFields: Record<string, any> = {};
      groupby.forEach((item) => {
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
        _id: groupFields,
      };
    }

    // Add aggregations for other columns
    if (columns && Array.isArray(columns)) {
      columns.forEach((column) => {
        if (typeof column === 'object') {
          // Check for aggregation functions like COUNT, SUM, AVG, etc.
          if (
            column.expr &&
            column.expr.type &&
            (column.expr.type === 'function' || column.expr.type === 'aggr_func')
          ) {
            const funcName = column.expr.name.toLowerCase();
            const args =
              column.expr.args && column.expr.args.expr ? column.expr.args.expr : column.expr.args;

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
            const isGroupByField = groupby.some((g) => {
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
   * Convert SQL JOINs to MongoDB $lookup stages
   */
  private convertJoins(
    from: any[],
    where: any
  ): { from: string; localField: string; foreignField: string; as: string }[] {
    if (!from || !Array.isArray(from) || from.length <= 1) {
      return [];
    }

    log('Converting JOINs:', JSON.stringify(from, null, 2));
    log('With WHERE:', JSON.stringify(where, null, 2));

    const lookups: { from: string; localField: string; foreignField: string; as: string }[] = [];
    const mainTable = this.extractTableName(from[0]);
    const mainAlias = from[0].as || mainTable;

    // Store all aliases for JOIN handling
    for (const fromItem of from) {
      if (fromItem.as && fromItem.table) {
        this.currentTableAliases.set(fromItem.as, fromItem.table);
        log(`Registered JOIN alias: ${fromItem.as} -> ${fromItem.table}`);
      }
    }

    // Extract join conditions from the WHERE clause
    // This is a simplification that assumes the ON conditions are in the WHERE clause
    const joinConditions = this.extractJoinConditions(where, from);

    // Handle JOIN syntax with explicit ON clause that comes from SQL parser
    for (let i = 1; i < from.length; i++) {
      // Check if this is a JOIN with an ON clause
      if (from[i].join && from[i].on) {
        log(`Found explicit JOIN with ON clause: ${JSON.stringify(from[i].on, null, 2)}`);

        // Parse the ON condition based on different formats the parser might produce
        if (from[i].on.expr) {
          // Handle the case where the ON condition is in expr format
          const onExpr = from[i].on.expr;
          if (onExpr.type === 'binary_expr' && onExpr.operator === '=') {
            if (onExpr.left?.type === 'column_ref' && onExpr.right?.type === 'column_ref') {
              const leftTable = onExpr.left.table || '';
              const leftField = onExpr.left.column || '';
              const rightTable = onExpr.right.table || '';
              const rightField = onExpr.right.column || '';

              if (leftTable && leftField && rightTable && rightField) {
                joinConditions.push({
                  leftTable,
                  leftField: `${leftTable}.${leftField}`,
                  rightTable,
                  rightField: `${rightTable}.${rightField}`,
                });
                log(
                  `Added explicit JOIN condition from expr: ${leftTable}.${leftField} = ${rightTable}.${rightField}`
                );
              }
            }
          }
        }
        // Handle the case where the ON clause has direct left/right properties
        else if (from[i].on.left && from[i].on.right) {
          const leftTable = from[i].on.left.table || '';
          const leftField = from[i].on.left.column || '';
          const rightTable = from[i].on.right.table || '';
          const rightField = from[i].on.right.column || '';

          if (leftTable && leftField && rightTable && rightField) {
            joinConditions.push({
              leftTable,
              leftField: `${leftTable}.${leftField}`,
              rightTable,
              rightField: `${rightTable}.${rightField}`,
            });
            log(
              `Added explicit JOIN condition: ${leftTable}.${leftField} = ${rightTable}.${rightField}`
            );
          }
        }
      }
    }

    // Process each table after the first one (the main table)
    for (let i = 1; i < from.length; i++) {
      const joinedTable = this.extractTableName(from[i]);
      const joinedAlias = from[i].as || joinedTable;

      // Look for JOIN condition for this table
      const joinCond = joinConditions.find(
        (cond) =>
          (cond.leftTable === mainAlias && cond.rightTable === joinedAlias) ||
          (cond.leftTable === joinedAlias && cond.rightTable === mainAlias)
      );

      if (joinCond) {
        log(`Found join condition between ${mainAlias} and ${joinedAlias}`);

        // Extract fields without the table prefix to use for MongoDB $lookup
        let localField = joinCond.leftField;
        let foreignField = joinCond.rightField;

        // If fields include table prefix, remove it
        if (joinCond.leftTable === mainAlias && localField.startsWith(`${mainAlias}.`)) {
          localField = localField.substring(mainAlias.length + 1);
        }

        if (joinCond.rightTable === joinedAlias && foreignField.startsWith(`${joinedAlias}.`)) {
          foreignField = foreignField.substring(joinedAlias.length + 1);
        }

        // Swap if needed to ensure the localField is from the left table
        if (joinCond.leftTable !== mainAlias) {
          [localField, foreignField] = [foreignField, localField];
        }

        log(`Using join fields: ${localField} = ${foreignField}`);

        lookups.push({
          from: joinedTable,
          localField,
          foreignField,
          as: joinedAlias,
        });
      } else {
        // If no explicit join condition was found, try to find one from the ON clause
        // otherwise assume it's a cross join or use common naming conventions

        // Check if there might be an ON clause directly in the from item
        if (from[i].on) {
          log(`Found ON clause in JOIN: ${JSON.stringify(from[i].on, null, 2)}`);
          // Try to extract fields from ON clause
          // This would need implementation specific to your SQL parser
        }

        // Default to standard naming convention
        let localField = '_id';
        let foreignField = `${mainTable.toLowerCase().replace(/s$/, '')}Id`;

        lookups.push({
          from: joinedTable,
          localField,
          foreignField,
          as: joinedAlias,
        });
      }
    }

    log('Generated lookups:', JSON.stringify(lookups, null, 2));
    return lookups;
  }

  /**
   * Extract join conditions from the WHERE clause
   */
  private extractJoinConditions(
    where: any,
    tables: any[]
  ): Array<{
    leftTable: string;
    leftField: string;
    rightTable: string;
    rightField: string;
  }> {
    log('Extracting join conditions from:', JSON.stringify(where, null, 2));
    log('Tables:', JSON.stringify(tables, null, 2));

    if (!where) {
      // Check if we have explicit join info in the tables
      for (let i = 1; i < tables.length; i++) {
        if (tables[i].join && tables[i].on) {
          log('Found explicit ON condition in JOIN:', JSON.stringify(tables[i].on, null, 2));

          // Parse the ON condition from the JOIN clause
          if (
            tables[i].on.left?.table &&
            tables[i].on.left?.column &&
            tables[i].on.right?.table &&
            tables[i].on.right?.column
          ) {
            const leftTable = tables[i].on.left.table;
            const leftField = `${leftTable}.${tables[i].on.left.column}`;
            const rightTable = tables[i].on.right.table;
            const rightField = `${rightTable}.${tables[i].on.right.column}`;

            log(
              `Extracted join condition from ON clause: ${leftTable}.${tables[i].on.left.column} = ${rightTable}.${tables[i].on.right.column}`
            );

            return [
              {
                leftTable,
                leftField,
                rightTable,
                rightField,
              },
            ];
          }
        }
      }
      return [];
    }

    // Map of table names and aliases
    const tableMap = new Map<string, string>();

    // Build map of both actual table names and aliases
    tables.forEach((t) => {
      if (typeof t === 'string') {
        tableMap.set(t, t);
      } else {
        // Add table name
        tableMap.set(t.table, t.table);
        // Add alias if present
        if (t.as) {
          tableMap.set(t.as, t.table);
        }
      }
    });

    log('Table name/alias map:', Object.fromEntries(tableMap.entries()));

    const conditions: Array<{
      leftTable: string;
      leftField: string;
      rightTable: string;
      rightField: string;
    }> = [];

    // For equality comparisons in the WHERE clause that reference different tables
    if (where.type === 'binary_expr' && where.operator === '=') {
      if (
        where.left &&
        where.left.type === 'column_ref' &&
        where.left.table &&
        where.right &&
        where.right.type === 'column_ref' &&
        where.right.table
      ) {
        const leftTable = where.left.table;
        const leftField = `${leftTable}.${where.left.column}`;
        const rightTable = where.right.table;
        const rightField = `${rightTable}.${where.right.column}`;

        // Check if both tables/aliases exist in our mapping
        if (tableMap.has(leftTable) && tableMap.has(rightTable) && leftTable !== rightTable) {
          log(
            `Found join condition: ${leftTable}.${where.left.column} = ${rightTable}.${where.right.column}`
          );
          conditions.push({
            leftTable,
            leftField,
            rightTable,
            rightField,
          });
        }
      }
    }
    // Check for join condition in the ON clause
    else if (where.type === 'on_clause' && where.on) {
      const onConditions = this.extractJoinConditions(where.on, tables);
      conditions.push(...onConditions);
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
