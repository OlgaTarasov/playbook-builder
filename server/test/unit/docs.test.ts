import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { openApiSpec } from '../../src/docs/openapi';

// The docs routes never touch the database, so the client is not used.
const app = createApp({ prisma: {} as PrismaClient, jwtSecret: 'x'.repeat(32) });

describe('API docs', () => {
  it('serves the OpenAPI document without a session', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('Playbook Builder API');
  });

  it('serves the Swagger UI page without a session', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    // Relative spec URL, so the page works under /docs and /api/docs alike.
    expect(res.text).toContain("url: 'openapi.json'");
  });

  it('documents every protected route the app mounts', () => {
    const documented = Object.keys(openApiSpec.paths);
    const expected = [
      '/auth/register',
      '/auth/login',
      '/auth/logout',
      '/auth/me',
      '/triggers',
      '/triggers/available',
      '/triggers/added',
      '/actions',
      '/playbooks',
      '/playbooks/{id}',
      '/simulateTrigger',
    ];
    expect(documented.sort()).toEqual(expected.sort());
  });
});
