// A simple test for group by functionality
const { SqlParserImpl } = require('../parser');
const { SqlCompilerImpl } = require('../compiler');

const parser = new SqlParserImpl();
const compiler = new SqlCompilerImpl();

function testGroupBy() {
    const sql = "SELECT category, COUNT(*) as count, AVG(price) as avg_price FROM products GROUP BY category";
    const statement = parser.parse(sql);
    console.log('Parsed statement:', JSON.stringify(statement.ast, null, 2));
    
    const commands = compiler.compile(statement);
    console.log('Generated commands:', JSON.stringify(commands, null, 2));
    
    // Check the results
    if (commands.length !== 1) {
        console.error('Expected 1 command, got', commands.length);
        return false;
    }
    
    const command = commands[0];
    if (command.type !== 'FIND') {
        console.error('Expected FIND command, got', command.type);
        return false;
    }
    
    if (!command.pipeline) {
        console.error('Expected pipeline, but none found');
        return false;
    }
    
    // Find group stage in pipeline
    const groupStage = command.pipeline.find(stage => '$group' in stage);
    if (!groupStage) {
        console.error('Expected $group stage, but none found');
        return false;
    }
    
    console.log('Group stage:', JSON.stringify(groupStage, null, 2));
    
    if (!groupStage.$group.count) {
        console.error('Expected count in group stage, but not found');
        return false;
    }
    
    if (!groupStage.$group.avg_price) {
        console.error('Expected avg_price in group stage, but not found');
        return false;
    }
    
    console.log('Group by test PASSED');
    return true;
}

testGroupBy();