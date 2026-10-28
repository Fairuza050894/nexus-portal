import { t } from './i18n.js';
import { PORTAL_STYLES } from './styles.js';
import { renderHeader, renderStepBar } from './components/nav.js';
import { renderStep1Target } from './components/step-target.js';
import { renderStep2Builder } from './components/step-builder.js';
import { renderStep3PlanReview } from './components/step-plan.js';
import { renderStep4LiveRun } from './components/step-live.js';
import { renderStep5Results } from './components/step-results.js';
import { renderStep6Lineage } from './components/step-lineage.js';
import { renderClientScript } from './components/client-script.js';
import type { PortalState } from './state.js';

export function renderPortalHtml(state: PortalState): string {
  const lang = state.language;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t(lang, 'appTitle')} — ${t(lang, 'appSubtitle')}</title>
  <style>
${PORTAL_STYLES}
  </style>
</head>
<body>
  ${renderHeader(state)}

  <div class="console-layout">
    ${renderStepBar(state)}

    <!-- Main Step Views: All 6 rendered so client-side switching is instant -->
    <main id="portal-content">
      <div id="step-view-1" class="step-panel" style="${state.currentStep === 1 ? 'display:block' : 'display:none'}">
        ${renderStep1Target(state)}
      </div>
      <div id="step-view-2" class="step-panel" style="${state.currentStep === 2 ? 'display:block' : 'display:none'}">
        ${renderStep2Builder(state)}
      </div>
      <div id="step-view-3" class="step-panel" style="${state.currentStep === 3 ? 'display:block' : 'display:none'}">
        ${renderStep3PlanReview(state)}
      </div>
      <div id="step-view-4" class="step-panel" style="${state.currentStep === 4 ? 'display:block' : 'display:none'}">
        ${renderStep4LiveRun(state)}
      </div>
      <div id="step-view-5" class="step-panel" style="${state.currentStep === 5 ? 'display:block' : 'display:none'}">
        ${renderStep5Results(state)}
      </div>
      <div id="step-view-6" class="step-panel" style="${state.currentStep === 6 ? 'display:block' : 'display:none'}">
        ${renderStep6Lineage(state)}
      </div>
    </main>
  </div>

  <script>
${renderClientScript(state)}
  </script>
</body>
</html>`;
}
