import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

export interface HealthStatus {
  status: 'ok';
  version: string;
  time: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: "État de l'API" })
  @ApiOkResponse({ description: "L'API est en ligne." })
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      version: '0.1.0',
      time: new Date().toISOString(),
    };
  }
}
