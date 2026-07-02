import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

const defaultCorsOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4201',
  'http://127.0.0.1:4201',
  'https://hnb.co.za',
];

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? defaultCorsOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust exactly one reverse proxy (the documented deploy topology) so the real
  // client IP is read from X-Forwarded-For — required for correct per-IP rate
  // limiting and for req.secure. Trusting only the first hop prevents clients from
  // spoofing X-Forwarded-For to evade the throttler.
  app.set('trust proxy', 1);

  // Security headers (see docs/security M1): HSTS, X-Content-Type-Options,
  // frameguard, Referrer-Policy, a conservative CSP, etc. HSTS is only emitted
  // over HTTPS. Product images are served from this origin but embedded by the
  // web app on another origin, so allow cross-origin resource loads for them.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: { maxAge: 15_552_000, includeSubDomains: true },
    }),
  );

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Local-disk product images; swap for object storage behind FileUploadService later.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
