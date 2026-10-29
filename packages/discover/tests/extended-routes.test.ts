import { describe, expect, it } from 'vitest';
import { laravelRoutes, fastApiRoutes, springBootRoutes } from '../src/index.js';

describe('Extended Framework Route Extractors (8.5)', () => {
  it('extracts Laravel PHP routes from routes/web.php or routes/api.php syntax', () => {
    const phpSource = `
      <?php
      use Illuminate\\Support\\Facades\\Route;

      Route::get('/users', [UserController::class, 'index']);
      Route::post('/api/orders', [OrderController::class, 'store']);
      Route::delete('/api/orders/{id}', [OrderController::class, 'destroy']);
    `;

    const routes = laravelRoutes('routes/api.php', phpSource);
    expect(routes).toHaveLength(3);
    expect(routes[0]).toMatchObject({ method: 'GET', path: '/users', framework: 'laravel' });
    expect(routes[1]).toMatchObject({ method: 'POST', path: '/api/orders', framework: 'laravel' });
    expect(routes[2]).toMatchObject({
      method: 'DELETE',
      path: '/api/orders/{id}',
      framework: 'laravel',
    });
  });

  it('extracts FastAPI Python routes from @app and @router decorators', () => {
    const pythonSource = `
      from fastapi import FastAPI, APIRouter

      app = FastAPI()
      router = APIRouter()

      @app.get("/health")
      def health_check():
          return {"status": "ok"}

      @router.post("/items")
      async def create_item(item: Item):
          return item
    `;

    const routes = fastApiRoutes('main.py', pythonSource);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ method: 'GET', path: '/health', framework: 'fastapi' });
    expect(routes[1]).toMatchObject({ method: 'POST', path: '/items', framework: 'fastapi' });
  });

  it('extracts Spring Boot Java controller routes from annotations', () => {
    const javaSource = `
      package com.company.controller;

      import org.springframework.web.bind.annotation.*;

      @RestController
      @RequestMapping("/api/v1")
      public class AccountController {

          @GetMapping("/accounts")
          public List<Account> list() { return null; }

          @PostMapping(value = "/accounts/transfer")
          public ResponseEntity<?> transfer() { return null; }

          @DeleteMapping(path = "/accounts/{id}")
          public void close() {}
      }
    `;

    const routes = springBootRoutes('AccountController.java', javaSource);
    expect(routes).toHaveLength(3);
    expect(routes[0]).toMatchObject({ method: 'GET', path: '/accounts', framework: 'spring' });
    expect(routes[1]).toMatchObject({
      method: 'POST',
      path: '/accounts/transfer',
      framework: 'spring',
    });
    expect(routes[2]).toMatchObject({
      method: 'DELETE',
      path: '/accounts/{id}',
      framework: 'spring',
    });
  });
});
