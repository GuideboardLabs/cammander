import { Module } from '@nestjs/common';
import { TerminalGateway } from './terminal.gateway';

@Module({
  providers: [TerminalGateway],
})
export class TerminalModule {}