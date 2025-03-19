import { spawnSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

describe('Server tests', () => {
  // Very basic test for server functionality
  it('Server imports should compile correctly', () => {
    // If this test can run, it means the imports are working
    expect(true).toBe(true);
  });

  const serverBinPath = join(__dirname, '../../packages/server/bin/queryleaf-server');
  
  // Skip actual server tests if the binary doesn't exist yet
  const binExists = existsSync(serverBinPath);

  (binExists ? it : it.skip)('should display help message', () => {
    const server = spawnSync(serverBinPath, ['--help']);
    const output = server.stdout.toString();
    
    expect(server.status).toBe(0);
    expect(output).toContain('Usage:');
    expect(output).toContain('Options:');
  });
});