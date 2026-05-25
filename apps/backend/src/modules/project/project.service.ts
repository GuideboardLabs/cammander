import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface WebApp {
  name: string;
  url: string;
  description?: string;
  source: 'config' | 'auto';
}

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private config: ConfigService) {}

  private get root(): string {
    return this.config.get<string>('WORKSPACE_ROOT', '/tmp');
  }

  /** Get all web apps for the current project */
  async getWebApps(): Promise<WebApp[]> {
    const apps: WebApp[] = [];

    // 1. Read cammander.json
    const configPath = path.join(this.root, 'cammander.json');
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);
        if (Array.isArray(config.webApps)) {
          for (const app of config.webApps) {
            apps.push({
              name: app.name || 'Web App',
              url: app.url || '',
              description: app.description,
              source: 'config',
            });
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to parse cammander.json: ${e.message}`);
      }
    }

    // 2. Auto-detect from package.json
    const pkgPath = path.join(this.root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts) {
          const portMap: Record<string, number> = {
            dev: 5173,      // Vite
            start: 3000,    // Next.js / Express
            serve: 3000,    // General serve
            preview: 4173,  // Vite preview
          };

          for (const [scriptName, url] of [
            ['dev', 'http://localhost:5173'],
            ['start', 'http://localhost:3000'],
            ['serve', 'http://localhost:3000'],
            ['preview', 'http://localhost:4173'],
            ['dev:frontend', 'http://localhost:5173'],
            ['dev:backend', 'http://localhost:3000'],
          ] as const) {
            if (pkg.scripts[scriptName]) {
              // Don't duplicate if already in config
              const existing = apps.find(a => a.url === url);
              if (!existing) {
                apps.push({
                  name: `npm run ${scriptName}`,
                  url,
                  description: pkg.name ? `${pkg.name} — ${scriptName}` : scriptName,
                  source: 'auto',
                });
              }
            }
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to parse package.json: ${e.message}`);
      }
    }

    // 3. Auto-detect from docker-compose.yml / docker-compose.yaml
    for (const filename of ['docker-compose.yml', 'docker-compose.yaml']) {
      const dockerPath = path.join(this.root, filename);
      if (fs.existsSync(dockerPath)) {
        try {
          // Simple port extraction — just look for published ports
          const content = fs.readFileSync(dockerPath, 'utf-8');
          const portRegex = /['"]?(\d{4,5})['"]?\s*:\s*['"]?(\d{4,5})['"]?/g;
          const seenPorts = new Set<string>();
          let match: RegExpExecArray | null;
          while ((match = portRegex.exec(content)) !== null) {
            const hostPort = match[1];
            if (!seenPorts.has(hostPort)) {
              seenPorts.add(hostPort);
              const existing = apps.find(a => a.url.includes(`:${hostPort}`));
              if (!existing) {
                apps.push({
                  name: `Docker (port ${hostPort})`,
                  url: `http://localhost:${hostPort}`,
                  description: `Docker Compose service`,
                  source: 'auto',
                });
              }
            }
          }
        } catch (e: any) {
          this.logger.warn(`Failed to parse ${filename}: ${e.message}`);
        }
      }
    }

    return apps;
  }

  /** Read cammander.json metadata */
  getProjectMeta(): Record<string, any> {
    const configPath = path.join(this.root, 'cammander.json');
    if (!fs.existsSync(configPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      return {};
    }
  }
}
