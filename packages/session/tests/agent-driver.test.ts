import { describe, expect, it } from 'vitest';
import {
  classifyInputElement,
  generateMockValueForSemanticKind,
  AutonomousQaAgent,
  type AgentAction,
  type AutonomousJourneyResult,
} from '../src/index.js';

describe('Autonomous AI QA Agent Driver (Fase 14)', () => {
  describe('Semantic Input Classification & Mock Value Generation', () => {
    it('accurately classifies input fields by attributes and intent', () => {
      expect(classifyInputElement({ tag: 'input', type: 'password', name: 'user_pass' })).toBe('password');
      expect(classifyInputElement({ tag: 'input', type: 'email', id: 'email-field' })).toBe('email');
      expect(classifyInputElement({ tag: 'input', placeholder: 'Masukkan username...' })).toBe('username');
      expect(classifyInputElement({ tag: 'input', type: 'search', name: 'q' })).toBe('search');
      expect(classifyInputElement({ tag: 'input', type: 'tel', name: 'no_telepon' })).toBe('phone');
      expect(classifyInputElement({ tag: 'input', type: 'number', name: 'quantity' })).toBe('number');
      expect(classifyInputElement({ tag: 'input', type: 'checkbox', name: 'agree' })).toBe('checkbox');
      expect(classifyInputElement({ tag: 'input', name: 'custom_notes' })).toBe('generic-text');
    });

    it('generates realistic mock data according to semantic kind', () => {
      const email = generateMockValueForSemanticKind('email');
      expect(email).toContain('@');

      const password = generateMockValueForSemanticKind('password');
      expect(password.length).toBeGreaterThanOrEqual(8);

      const phone = generateMockValueForSemanticKind('phone');
      expect(phone).toMatch(/^08[0-9]+/);

      const search = generateMockValueForSemanticKind('search');
      expect(search.length).toBeGreaterThan(0);

      // Respects injected credentials
      const customEmail = generateMockValueForSemanticKind('email', { email: 'admin@company.com' });
      expect(customEmail).toBe('admin@company.com');
    });
  });

  describe('Autonomous Action Loop & Mode Guard Constraints', () => {
    it('creates an AutonomousQaAgent instance with configured options', () => {
      const agent = new AutonomousQaAgent({
        maxSteps: 8,
        mode: 'sandbox',
        credentials: {
          email: 'qa@local.test',
          password: 'SecretPassword123!',
        },
      });

      expect(agent).toBeDefined();
    });

    it('respects prod-safe mode guard by refusing to click submit mutating buttons', async () => {
      // Mock page object simulating Playwright Page
      const mockPage: any = {
        url: () => 'https://staging.company.local/login',
        goto: async () => {},
        on: () => {},
        evaluate: async () => ({
          inputs: [
            { tag: 'input', type: 'email', selector: '#email', name: 'email', semanticKind: 'email' },
            { tag: 'input', type: 'password', selector: '#password', name: 'password', semanticKind: 'password' },
          ],
          buttons: [
            { tag: 'button', type: 'submit', selector: '#btn-submit', text: 'Masuk' },
          ],
          links: [],
          formsCount: 1,
          anomalies: [],
        }),
        fill: async () => {},
        click: async () => {},
        waitForTimeout: async () => {},
      };

      const agent = new AutonomousQaAgent({
        mode: 'prod-safe',
        maxSteps: 5,
      });

      const result = await agent.runAutonomousJourney(
        mockPage,
        'https://staging.company.local/login',
      );

      // Verify that the submit button click was skipped by Mode Guard in prod-safe
      expect(result.reproduction.some((r) => r.includes('Mode Guard enforced'))).toBe(true);
      expect(result.actions.some((a) => a.value === 'skipped by mode-guard in prod-safe')).toBe(true);
    });
  });
});
