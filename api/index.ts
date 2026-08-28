import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { json, urlencoded } from 'express';

const server = express();
let isInitialized = false;

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
  );

  app.enableCors({
    origin: '*',
  });

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.init();
  isInitialized = true;
}

export default async function handler(req: any, res: any) {
  if (!isInitialized) {
    await bootstrap();
  }
  server(req, res);
}
