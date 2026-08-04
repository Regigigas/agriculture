import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || origin === 'null') return callback(null, true);
      try {
        const host = new URL(origin).hostname;
        const allowed = host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
          /^10\./.test(host) || /^192\.168\./.test(host) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host);
        callback(allowed ? null : new Error('不允许的跨域来源'), allowed);
      } catch {
        callback(new Error('无效的跨域来源'), false);
      }
    },
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-key', 'x-operation-id', 'x-target-server-id'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });

  const configuredPort = Number(process.env.PORT ?? 3100);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3100;
  const host = process.env.HOST?.trim() || '127.0.0.1';
  await app.listen(port, host);

  const utilityProcess = process as NodeJS.Process & {
    parentPort?: {
      on(event: 'message', listener: (event: { data?: unknown }) => void): void;
      postMessage(message: unknown): void;
    };
  };
  utilityProcess.parentPort?.on('message', (event) => {
    const message = event.data as { type?: string } | undefined;
    if (message?.type !== 'shutdown') return;
    void app.close().then(() => {
      utilityProcess.parentPort?.postMessage({ type: 'shutdown-complete' });
      process.exit(0);
    });
  });
}

void bootstrap();
