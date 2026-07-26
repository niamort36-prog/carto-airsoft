import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // API-first (§2.2) : toute la surface est versionnée et documentée dès la première route.
  app.setGlobalPrefix('v1');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('Carto Airsoft API')
    .setDescription(
      "API arbitre de l'application tactique airsoft. " +
        "Unique point d'accès aux données pour l'app mobile, la console web et les clients tiers.",
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 : joignable depuis l'émulateur (10.0.2.2) et depuis un téléphone
  // réel sur le même Wi-Fi, pas seulement en local.
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
