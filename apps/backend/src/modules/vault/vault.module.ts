import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

@Module({
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule implements OnModuleInit {
  private readonly logger = new Logger(VaultModule.name);

  constructor(private vault: VaultService) {}

  onModuleInit() {
    // Seed default gbrain-inspired vault notes on first launch
    try {
      this.vault.seedDefaults();
    } catch (err: any) {
      this.logger.warn(`Vault seed skipped: ${err.message}`);
    }
  }
}