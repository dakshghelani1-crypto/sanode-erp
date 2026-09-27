import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production.');
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  app.use(cookieParser());
  const allowedOrigins = process.env.WEB_ORIGIN?.split(',').map((o) => o.trim()) ?? ['http://localhost:3000'];
  app.enableCors({
    origin: (requestOrigin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!requestOrigin || allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin) || requestOrigin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  if (process.env.NODE_ENV !== 'production' || process.env.EXPOSE_API_DOCS === 'true') {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder()
      .setTitle('Sanode Operations API')
      .setDescription('Batch-aware inventory, FEFO dispatch, trade schemes, and MR sample operations.')
      .setVersion('1.0')
      .addCookieAuth('sanode_access')
      .build());
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/openapi.json' });
  }
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
