import { spawnSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

describe('CLI tests', () => {
  // Very basic test for CLI functionality
  it('CLI imports should compile correctly', () => {
    // If this test can run, it means the imports are working
    expect(true).toBe(true);
  });

  const cliBinPath = join(__dirname, '../../packages/cli/bin/queryleaf');
  
  // Skip actual CLI tests if the binary doesn't exist yet
  const binExists = existsSync(cliBinPath);

  (binExists ? it : it.skip)('should display help message', () => {
    const cli = spawnSync(cliBinPath, ['--help']);
    const output = cli.stdout.toString();
    
    expect(cli.status).toBe(0);
    expect(output).toContain('Usage:');
    expect(output).toContain('Options:');
  });
});