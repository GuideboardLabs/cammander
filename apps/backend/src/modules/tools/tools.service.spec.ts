import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ToolsService } from './tools.service';

describe('ToolsService', () => {
  let service: ToolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsService,
        {
          provide: ConfigService,
          useValue: { get: () => '/tmp' },
        },
      ],
    }).compile();
    service = module.get<ToolsService>(ToolsService);
  });

  describe('bash', () => {
    it('rejects commands with shell metacharacters', async () => {
      const result = await service.execute('bash', { command: 'echo hello; rm -rf /' }, 'tc1');
      expect(result.error).toBeFalsy(); // we return a refusal string, not throw
      expect(result.content).toMatch(/Refused.*metacharacters/);
    });

    it('allows simple safe commands', async () => {
      const result = await service.execute('bash', { command: 'echo cammander-test' }, 'tc2');
      expect(result.content).toContain('cammander-test');
      expect(result.error).toBeFalsy();
    });
  });

  describe('grep', () => {
    it('finds a known pattern in the repo', async () => {
      service.setWorkspaceRoot('/home/sc/Documents/cammander');
      const result = await service.execute(
        'grep',
        { pattern: 'class ToolsService', path: 'apps/backend/src/modules/tools', glob: '*.ts' },
        'tc3',
      );
      expect(result.content).toMatch(/class ToolsService/);
      expect(result.error).toBeFalsy();
    });
  });

  describe('read_file', () => {
    it('returns line-numbered content', async () => {
      service.setWorkspaceRoot('/home/sc/Documents/cammander');
      const result = await service.execute(
        'read_file',
        { path: 'apps/backend/src/modules/tools/tools.service.ts', offset: 1, limit: 5 },
        'tc4',
      );
      expect(result.content).toMatch(/1\|import/);
      expect(result.error).toBeFalsy();
    });
  });
});
