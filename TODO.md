# QueryLeaf Project TODO List

## Integration Tests 
We've implemented the following tests:

### Simple Queries
- [x] Test SELECT with multiple column aliases (implemented and working)
- [ ] Test SELECT with arithmetic operations in projections
- [x] Test SELECT with multiple WHERE conditions connected by OR (implemented and working)
- [x] Test SELECT with IN operator (implemented and working)
- [ ] Test SELECT with NOT IN operator
- [ ] Test SELECT with NULL/NOT NULL checks
- [ ] Test SELECT with LIMIT and OFFSET
- [ ] Test SELECT with ORDER BY multiple fields
- [ ] Test SELECT with ORDER BY ASC/DESC combinations

### Nested Field Access
- [ ] Test querying on deeply nested fields (3+ levels deep)
- [x] Test projecting multiple nested fields simultaneously (implemented, working with fixes)
- [x] Test filtering with comparisons on nested fields (implemented, working with fixes)
- [ ] Test updating nested fields
- [x] Test nested field access with complex WHERE conditions (implemented, working with fixes)

### Array Access
- [x] Test querying arrays with multiple indices (implemented, working with fixes)
- [x] Test filtering by array element properties at different indices (implemented, working with fixes)
- [ ] Test filtering by multiple array elements simultaneously
- [ ] Test projecting multiple array elements in one query
- [ ] Test array access with nested arrays
- [ ] Test updating array elements

### GROUP BY
- [x] Test GROUP BY with multiple columns (implemented, working with fixes)
- [ ] Test GROUP BY with HAVING clause
- [ ] Test GROUP BY with multiple aggregation functions
- [x] Test aggregation functions: AVG, MIN, MAX, COUNT (implemented, working with fixes)
- [ ] Test GROUP BY with ORDER BY on aggregation results
- [ ] Test GROUP BY with complex expressions
- [ ] Test GROUP BY with filtering before aggregation
- [ ] Test GROUP BY on nested fields
- [ ] Test performance with large dataset aggregation

### JOINs
- [x] Test INNER JOIN with multiple conditions
- [ ] Test LEFT OUTER JOIN implementation
- [ ] Test RIGHT OUTER JOIN implementation
- [ ] Test FULL OUTER JOIN implementation
- [ ] Test JOIN with WHERE conditions
- [ ] Test multiple JOINs in one query (3+ tables)
- [ ] Test JOINs with aggregation
- [ ] Test JOINs with nested field access
- [ ] Test JOINs with array field access
- [ ] Test performance with large dataset JOINs

### Advanced Features
- [ ] Test CASE statements in SELECT list
- [ ] Test subqueries in WHERE clause
- [ ] Test subqueries in FROM clause
- [ ] Test window functions if supported
- [ ] Test date/time functions
- [ ] Test string functions

### Edge Cases
- [x] Test handling of special characters in field names
- [x] Test handling of extremely large result sets
- [x] Test behavior with invalid SQL syntax
- [x] Test behavior with valid SQL but unsupported features
- [x] Test behavior with missing collections
- [x] Test behavior with invalid data types
- [x] Test handling of MongoDB ObjectId conversions

## Performance Testing
- [ ] Benchmark simple queries vs native MongoDB queries
- [ ] Benchmark complex queries vs native MongoDB queries
- [ ] Benchmark with increasing dataset sizes (10K, 100K, 1M documents)
- [ ] Identify bottlenecks in the translation process
- [ ] Optimize query execution for common patterns

## Documentation
- [ ] Document SQL syntax support and limitations
- [ ] Create examples of each supported SQL feature
- [ ] Document MongoDB query translation for each SQL feature
- [ ] Create a troubleshooting guide
- [ ] Add inline code documentation

## Feature Enhancements
- [ ] Add support for SQL DISTINCT
- [ ] Implement SQL subquery support
- [ ] Support for data types (DATE, TIMESTAMP, BOOLEAN)
- [ ] Add basic transaction support
- [ ] Support for SQL UNION, INTERSECT, EXCEPT
- [ ] Add index creation/management via SQL
- [ ] Implement execution plan visualization
- [ ] Add query caching
- [ ] Support for conditional expressions (CASE)
- [ ] Add execution metrics and query profiling