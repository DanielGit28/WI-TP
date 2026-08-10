import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  // rawBody: true makes the unparsed request body available as
  // req.rawBody (a Buffer) alongside the normally-parsed req.body.
  // GitHub's HMAC signature is computed over those exact raw bytes, so
  // this has to be captured before the body is JSON-parsed — you can't
  // reconstruct it afterward, since re-serializing the parsed object
  // isn't guaranteed to produce identical bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Allows a frontend running on a different origin (e.g. localhost:3000)
  // to call this API directly from the browser.
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false, // GitHub payloads vary widely by event type; we
      // validate the fields we rely on rather than stripping unknowns.
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Cloud Run injects PORT and expects the app to listen on 0.0.0.0.
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  await app.listen(port, '0.0.0.0');

  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}
bootstrap();
