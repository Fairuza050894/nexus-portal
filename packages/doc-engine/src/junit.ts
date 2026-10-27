import type { RunSummary } from '@nexus/core';

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function seconds(durationMs: number): string {
  return (Math.max(0, durationMs) / 1000).toFixed(3);
}

/**
 * Deterministic JUnit XML for CI. Only recorded test results are emitted; no
 * synthetic passing cases are added.
 */
export function createJUnit(summary: RunSummary): string {
  const tests = [...(summary.tests ?? [])].sort((left, right) =>
    `${left.lane}:${left.id}`.localeCompare(`${right.lane}:${right.id}`),
  );
  const byLane = new Map<string, typeof tests>();
  for (const test of tests) {
    const bucket = byLane.get(test.lane) ?? [];
    bucket.push(test);
    byLane.set(test.lane, bucket);
  }

  const suites = [...byLane.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lane, laneTests]) => {
      const failures = laneTests.filter((test) => test.status === 'failed').length;
      const skipped = laneTests.filter((test) => test.status === 'skipped').length;
      const duration = laneTests.reduce((total, test) => total + test.durationMs, 0);
      const cases = laneTests
        .map((test) => {
          const body =
            test.status === 'failed'
              ? `\n      <failure message="${xml(test.actual ?? test.reason ?? 'failed')}">${xml(
                  test.actual ?? test.reason ?? '',
                )}</failure>`
              : test.status === 'skipped'
                ? `\n      <skipped message="${xml(test.reason ?? 'skipped')}" />`
                : '';
          return `    <testcase classname="${xml(test.lane)}" name="${xml(test.title)}" time="${seconds(
            test.durationMs,
          )}"${test.status === 'skipped' ? ' status="skipped"' : ''}>${body}
    </testcase>`;
        })
        .join('\n');
      return `  <testsuite name="${xml(lane)}" tests="${laneTests.length}" failures="${failures}" errors="0" skipped="${skipped}" time="${seconds(
        duration,
      )}" timestamp="${xml(summary.run.startedAt)}">
${cases}
  </testsuite>`;
    })
    .join('\n');

  const failures = tests.filter((test) => test.status === 'failed').length;
  const skipped = tests.filter((test) => test.status === 'skipped').length;
  const totalDuration = tests.reduce((total, test) => total + test.durationMs, 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="nexus-portal" tests="${tests.length}" failures="${failures}" errors="0" skipped="${skipped}" time="${seconds(
    totalDuration,
  )}">
${suites}
</testsuites>
`;
}
