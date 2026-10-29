import { describe, expect, it } from 'vitest';
import { reverseEngineerBundle } from '../src/bundle-extractor.js';

describe('Reverse Engineering Bundle Extractor (REA principles)', () => {
  it('extracts fetch API endpoints with GET and POST methods', () => {
    const mockBundle = `
      function loadUsers() {
        return fetch('/api/v1/users').then(r => r.json());
      }
      function createUser(data) {
        return fetch('/api/v1/users', { method: 'POST', body: JSON.stringify(data) });
      }
      function updateSettings() {
        fetch('/api/settings/profile', { method: 'PUT' });
      }
    `;

    const result = reverseEngineerBundle(mockBundle);
    expect(result.endpoints).toHaveLength(3);
    expect(result.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'GET',
          path: '/api/v1/users',
          source: 'crawl',
          confidence: 'auto-discovered',
          tags: expect.arrayContaining(['reverse-engineered']),
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/v1/users',
          source: 'crawl',
          confidence: 'auto-discovered',
        }),
        expect.objectContaining({
          method: 'PUT',
          path: '/api/settings/profile',
          source: 'crawl',
          confidence: 'auto-discovered',
        }),
      ]),
    );
  });

  it('extracts axios calls and methods', () => {
    const mockBundle = `
      const api = {
        getTodos: () => axios.get('/api/todos'),
        addTodo: (t) => axios.post('/api/todos', t),
        deleteTodo: (id) => axios.delete('/api/todos/' + id),
      };
    `;

    const result = reverseEngineerBundle(mockBundle);
    expect(result.endpoints.some((e) => e.method === 'GET' && e.path === '/api/todos')).toBe(true);
    expect(result.endpoints.some((e) => e.method === 'POST' && e.path === '/api/todos')).toBe(true);
    expect(result.endpoints.some((e) => e.method === 'DELETE' && e.path === '/api/todos')).toBe(
      true,
    );
  });

  it('extracts literal API string paths and client routes', () => {
    const mockBundle = `
      const routes = [
        { path: '/dashboard', component: Dashboard },
        { path: '/account/billing', component: Billing },
        { path: '/orders/:id', component: OrderDetails },
      ];
      const API_URL = '/api/v2/reports/summary';
      const AUTH_URL = '/auth/token';
    `;

    const result = reverseEngineerBundle(mockBundle);
    expect(result.clientRoutes).toContain('/dashboard');
    expect(result.clientRoutes).toContain('/account/billing');
    expect(result.clientRoutes).toContain('/orders');
    expect(result.endpoints.some((e) => e.path === '/api/v2/reports/summary')).toBe(true);
    expect(result.endpoints.some((e) => e.path === '/auth/token')).toBe(true);
  });

  it('marks authenticated endpoints with authRequired: true based on sensitive keywords', () => {
    const mockBundle = `
      fetch('/api/admin/users');
      fetch('/api/public/status');
    `;

    const result = reverseEngineerBundle(mockBundle);
    const adminEp = result.endpoints.find((e) => e.path === '/api/admin/users');
    const publicEp = result.endpoints.find((e) => e.path === '/api/public/status');

    expect(adminEp?.authRequired).toBe(true);
    expect(publicEp?.authRequired).toBe(false);
  });
});
