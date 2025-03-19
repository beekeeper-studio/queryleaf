"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DummyMongoClient = exports.MongoExecutor = exports.SqlCompilerImpl = exports.SqlParserImpl = exports.DummyQueryLeaf = exports.QueryLeaf = void 0;
const parser_1 = require("./parser");
Object.defineProperty(exports, "SqlParserImpl", { enumerable: true, get: function () { return parser_1.SqlParserImpl; } });
const compiler_1 = require("./compiler");
Object.defineProperty(exports, "SqlCompilerImpl", { enumerable: true, get: function () { return compiler_1.SqlCompilerImpl; } });
const executor_1 = require("./executor");
Object.defineProperty(exports, "MongoExecutor", { enumerable: true, get: function () { return executor_1.MongoExecutor; } });
const dummy_client_1 = require("./executor/dummy-client");
Object.defineProperty(exports, "DummyMongoClient", { enumerable: true, get: function () { return dummy_client_1.DummyMongoClient; } });
/**
 * QueryLeaf: SQL to MongoDB query translator
 */
class QueryLeaf {
    /**
     * Create a new QueryLeaf instance with your MongoDB client
     * @param client Your MongoDB client
     * @param dbName Database name
     */
    constructor(client, dbName) {
        this.parser = new parser_1.SqlParserImpl();
        this.compiler = new compiler_1.SqlCompilerImpl();
        this.executor = new executor_1.MongoExecutor(client, dbName);
    }
    /**
     * Execute a SQL query on MongoDB
     * @param sql SQL query string
     * @returns Query results
     */
    async execute(sql) {
        const statement = this.parse(sql);
        const commands = this.compile(statement);
        return await this.executor.execute(commands);
    }
    /**
     * Parse a SQL query string
     * @param sql SQL query string
     * @returns Parsed SQL statement
     */
    parse(sql) {
        return this.parser.parse(sql);
    }
    /**
     * Compile a SQL statement to MongoDB commands
     * @param statement SQL statement
     * @returns MongoDB commands
     */
    compile(statement) {
        return this.compiler.compile(statement);
    }
    /**
     * Get the command executor instance
     * @returns Command executor
     */
    getExecutor() {
        return this.executor;
    }
    /**
     * No-op method for backward compatibility
     * QueryLeaf no longer manages MongoDB connections
     */
    async close() {
        // No-op - MongoDB client is managed by the user
    }
}
exports.QueryLeaf = QueryLeaf;
/**
 * Create a QueryLeaf instance with a dummy client for testing
 * No actual MongoDB connection is made
 */
class DummyQueryLeaf extends QueryLeaf {
    /**
     * Create a new DummyQueryLeaf instance
     * @param dbName Database name
     */
    constructor(dbName) {
        super(new dummy_client_1.DummyMongoClient(), dbName);
    }
}
exports.DummyQueryLeaf = DummyQueryLeaf;
// Re-export interfaces
__exportStar(require("./interfaces"), exports);
//# sourceMappingURL=index.js.map