import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') || '*',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`Backend listening on http://0.0.0.0:${port}`);
  console.log(`Terminal WebSocket on ws://0.0.0.0:${port}/terminal`);
}
bootstrap();