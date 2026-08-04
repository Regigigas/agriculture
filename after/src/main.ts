import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-key'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });

  const configuredPort = Number(process.env.PORT ?? 3100);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3100;
  await app.listen(port);
}

void bootstrap();
