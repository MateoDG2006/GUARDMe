import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import type { DbService } from '../../infra/db/db.service';

describe('HealthService', () => {
  it('returns 503 when the database does not respond', async () => {
    const db = {
      pingApi: jest.fn().mockRejectedValue(new Error('down')),
      asApi: jest.fn(),
    } as unknown as DbService;
    const config = { getOrThrow: jest.fn() } as unknown as ConfigService;
    const service = new HealthService(db, config);
    const result = await service.ready();
    expect(result.statusCode).toBe(503);
    expect(result.body.status).toBe('down');
    expect(result.body.checks.db).toBe('down');
  });
});
