import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app =
    await NestFactory.create(AppModule);

  app.enableCors({
    origin: (
      origin,
      callback,
    ) => {
      const allowedOrigins = [
        'http://localhost:5173',
        'https://sk-learning-frontend.vercel.app',
      ];

      if (!origin) {
        return callback(null, true);
      }

      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }

      return callback(
        new Error(
          'Not allowed by CORS',
        ),
        false,
      );
    },

    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(
    process.env.PORT || 3000,
  );
}

bootstrap();