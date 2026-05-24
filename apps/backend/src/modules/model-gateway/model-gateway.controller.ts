import { Controller, Get } from '@nestjs/common';
import { ModelGatewayService } from './model-gateway.service';
import { ModelDescriptor } from '../../common/interfaces/ai-provider.interface';

@Controller('models')
export class ModelGatewayController {
  constructor(private modelGateway: ModelGatewayService) {}

  @Get()
  async listModels(): Promise<ModelDescriptor[]> {
    return this.modelGateway.listModels();
  }
}