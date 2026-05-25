import { Controller, Get } from '@nestjs/common';
import { ProjectService } from './project.service';

@Controller('project')
export class ProjectController {
  constructor(private project: ProjectService) {}

  @Get('apps')
  async getApps() {
    return this.project.getWebApps();
  }

  @Get('meta')
  getMeta() {
    return this.project.getProjectMeta();
  }
}
