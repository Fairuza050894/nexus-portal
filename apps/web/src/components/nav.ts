import { t } from '../i18n.js';
import type { PortalState, PortalStep } from '../state.js';

export function renderHeader(state: PortalState): string {
  const lang = state.language;
  return `
  <header class="top-nav">
    <div class="brand-meta">
      <span class="brand-tag">NX</span>
      <span class="breadcrumb-path">nexus-portal / qa / <strong>pilot-app</strong></span>
      <span class="env-tag">env:local</span>
      <span class="env-tag" style="color:var(--accent-fg);">git:main@c23db59</span>
    </div>
    <div class="nav-actions">
      <span class="tag tag-meta">ROLE: ${state.userRole.toUpperCase()}</span>
      <button id="btn-toggle-lang" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">
        ${lang.toUpperCase()}
      </button>
    </div>
  </header>
  `;
}

export function renderStepNav(state: PortalState, step: PortalStep, label: string): string {
  const isActive = state.currentStep === step;
  const isComplete = state.furthestStep > step;
  const isAccessible = state.furthestStep >= step;

  let classes = 'step-item';
  if (isActive) classes += ' active';
  else if (isComplete) classes += ' complete';
  if (!isAccessible) classes += ' disabled';

  return `
    <div class="${classes}" data-step="${step}">
      <span class="step-number">0${step}</span>
      <span>${label.toUpperCase()}</span>
    </div>
  `;
}

export function renderStepBar(state: PortalState): string {
  const lang = state.language;
  return `
  <nav class="step-bar">
    ${renderStepNav(state, 1, t(lang, 'step1'))}
    ${renderStepNav(state, 2, t(lang, 'step2'))}
    ${renderStepNav(state, 3, t(lang, 'step3'))}
    ${renderStepNav(state, 4, t(lang, 'step4'))}
    ${renderStepNav(state, 5, t(lang, 'step5'))}
    ${renderStepNav(state, 6, t(lang, 'step6'))}
  </nav>
  `;
}
