import { describe, expect, it } from 'vitest';
import { STANDARD_VIEWPORTS } from '../src/index.js';

describe('Cross-Browser Matrix & Mobile Viewports (8.4)', () => {
  it('defines desktop, tablet, and mobile viewport specifications', () => {
    expect(STANDARD_VIEWPORTS.desktop.width).toBe(1366);
    expect(STANDARD_VIEWPORTS.desktop.height).toBe(768);
    expect(STANDARD_VIEWPORTS.desktop.isMobile).toBe(false);

    expect(STANDARD_VIEWPORTS.tablet.width).toBe(820);
    expect(STANDARD_VIEWPORTS.tablet.height).toBe(1180);
    expect(STANDARD_VIEWPORTS.tablet.isMobile).toBe(false);

    expect(STANDARD_VIEWPORTS.mobile.width).toBe(390);
    expect(STANDARD_VIEWPORTS.mobile.height).toBe(844);
    expect(STANDARD_VIEWPORTS.mobile.isMobile).toBe(true);
  });
});
