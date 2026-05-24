import { Module } from '@nestjs/common';
import { ModelGatewayController } from './model-gateway.controller';
import { ModelGatewayService } from './model-gateway.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [ModelGatewayController],
  providers: [ModelGatewayService],
  exports: [ModelGatewayService],
})
export class ModelGatewayModule {}