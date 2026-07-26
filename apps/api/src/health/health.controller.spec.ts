import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('répond ok avec version et horodatage', () => {
    const res = controller.getHealth();
    expect(res.status).toBe('ok');
    expect(res.version).toBe('0.1.0');
    expect(new Date(res.time).getTime()).not.toBeNaN();
  });
});
