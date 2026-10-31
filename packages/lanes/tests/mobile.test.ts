import { describe, expect, it } from 'vitest';
import type { QaConfig, RunRequest } from '@nexus/core';
import type { DiscoveryResult } from '@nexus/discover';
import type { AppMap } from '@nexus/app-map';
import {
  auditMobileManifest,
  parseMaestroFlowYaml,
  parseMobileCrashLogs,
  runMobileLane,
  validateMobileTarget,
} from '../src/mobile.js';
import { runLanes } from '../src/scheduler.js';
import type { LaneContext } from '../src/types.js';

function createMockContext(overrides?: Partial<LaneContext>): LaneContext {
  const req: RunRequest = {
    name: 'mobile-test',
    mode: 'sandbox',
    scope: 'quick',
    planApproval: 'auto',
    mobile: {
      platform: 'android',
      bundleId: 'com.example.mobileapp',
      appPath: '/path/to/app-release.apk',
      framework: 'maestro',
      deviceType: 'simulated',
    },
  };

  const discovery: DiscoveryResult = {
    pages: [],
    endpoints: [],
    forms: [],
    links: [],
    auth: { loginForms: [], protectedPaths: [] },
  };

  const appMap: AppMap = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
  };

  const config: QaConfig = {
    allowlist: ['localhost', '127.0.0.1'],
  };

  return {
    runId: 'mobile-test-run-1',
    runDir: '/tmp/nexus-mobile-run',
    mode: 'sandbox',
    scope: 'quick',
    request: req,
    config,
    discovery,
    appMap,
    ...overrides,
  };
}

describe('Mobile Lane: Target Validation & Compatibility', () => {
  it('accepts valid Android APK and AAB targets', () => {
    const apkRes = validateMobileTarget({
      platform: 'android',
      appPath: 'build/outputs/app-release.apk',
      bundleId: 'com.company.app',
      framework: 'maestro',
      deviceType: 'simulated',
    });
    expect(apkRes.valid).toBe(true);
    expect(apkRes.appType).toBe('apk');

    const aabRes = validateMobileTarget({
      platform: 'android',
      appPath: 'build/outputs/bundle.aab',
      bundleId: 'com.company.app',
      framework: 'maestro',
      deviceType: 'simulated',
    });
    expect(aabRes.valid).toBe(true);
    expect(aabRes.appType).toBe('aab');
  });

  it('accepts valid iOS IPA and APP targets', () => {
    const ipaRes = validateMobileTarget({
      platform: 'ios',
      appPath: 'build/Release-iphoneos/App.ipa',
      bundleId: 'com.company.iosapp',
      framework: 'maestro',
      deviceType: 'simulated',
    });
    expect(ipaRes.valid).toBe(true);
    expect(ipaRes.appType).toBe('ipa');
  });

  it('rejects platform and binary extension mismatches', () => {
    const mismatchRes = validateMobileTarget({
      platform: 'android',
      appPath: 'app.ipa',
      bundleId: 'com.company.app',
      framework: 'maestro',
      deviceType: 'simulated',
    });
    expect(mismatchRes.valid).toBe(false);
    expect(mismatchRes.errors[0]).toContain('iOS binary (.ipa) cannot be evaluated on android platform');

    const invalidExt = validateMobileTarget({
      platform: 'android',
      appPath: 'app.exe',
      bundleId: 'com.company.app',
      framework: 'maestro',
      deviceType: 'simulated',
    });
    expect(invalidExt.valid).toBe(false);
    expect(invalidExt.errors[0]).toContain('unrecognized mobile app binary extension');
  });
});

describe('Mobile Lane: Manifest Security & Hygiene Audits', () => {
  it('detects insecure debuggable flag in AndroidManifest', () => {
    const manifest = `
      <manifest package="com.insecure.app">
        <application android:debuggable="true" android:usesCleartextTraffic="false">
          <activity android:name=".MainActivity" android:exported="false" />
        </application>
      </manifest>
    `;
    const audit = auditMobileManifest(manifest, 'android');
    expect(audit.debuggable).toBe(true);
    expect(audit.usesCleartextTraffic).toBe(false);
  });

  it('detects cleartext traffic and unprotected exported components', () => {
    const manifest = `
      <manifest package="com.vulnerable.app">
        <uses-permission android:name="android.permission.INTERNET" />
        <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
        <application android:debuggable="false" android:usesCleartextTraffic="true">
          <activity android:name=".PublicActivity" android:exported="true" />
          <service android:name=".SecretService" android:exported="true" android:permission="com.app.CUSTOM_PERM" />
        </application>
      </manifest>
    `;
    const audit = auditMobileManifest(manifest, 'android');
    expect(audit.usesCleartextTraffic).toBe(true);
    expect(audit.dangerousPermissions).toContain('android.permission.READ_EXTERNAL_STORAGE');
    expect(audit.exportedComponents).toHaveLength(2);
    const unprotected = audit.exportedComponents.filter((c) => !c.permission);
    expect(unprotected).toHaveLength(1);
    expect(unprotected[0].name).toBe('.PublicActivity');
  });

  it('detects iOS App Transport Security (ATS) exemption in Info.plist', () => {
    const plist = `
      <plist version="1.0">
      <dict>
        <key>CFBundleIdentifier</key>
        <string>com.ios.app</string>
        <key>NSAppTransportSecurity</key>
        <dict>
          <key>NSAllowsArbitraryLoads</key>
          <true/>
        </dict>
      </dict>
      </plist>
    `;
    const audit = auditMobileManifest(plist, 'ios');
    expect(audit.atsAllowsArbitraryLoads).toBe(true);
    expect(audit.usesCleartextTraffic).toBe(true);
  });
});

describe('Mobile Lane: Flow Parsing & Crash Log Detection', () => {
  it('parses Maestro YAML commands into structured action steps', () => {
    const flowYaml = `
appId: com.nexus.app
---
- launchApp
- assertVisible: "Selamat Datang"
- inputText: "user@nexus.local"
- tapOn: "Tombol Masuk"
- scroll
- back
    `;
    const steps = parseMaestroFlowYaml(flowYaml);
    expect(steps).toHaveLength(6);
    expect(steps[0].command).toBe('launchApp');
    expect(steps[1].command).toBe('assertVisible: Selamat Datang');
    expect(steps[2].command).toBe('inputText: user@nexus.local');
    expect(steps[3].command).toBe('tapOn: Tombol Masuk');
    expect(steps[4].command).toBe('scroll');
    expect(steps[5].command).toBe('back');
  });

  it('extracts Android Runtime Fatal Exceptions from logcat output', () => {
    const logcat = `
--------- beginning of main
10-30 20:15:00.123 1111 1111 D NexusApp: Initializing app components...
10-30 20:15:01.456 1111 1111 E AndroidRuntime: FATAL EXCEPTION: main
Process: com.nexus.app, PID: 1111
java.lang.NullPointerException: Attempt to read from null object
\tat com.nexus.app.HomeActivity.onResume(HomeActivity.kt:55)
\tat android.app.Instrumentation.callActivityOnResume(Instrumentation.java:1456)
\tat android.app.Activity.performResume(Activity.java:8134)
--------- beginning of crash
    `;
    const crashes = parseMobileCrashLogs(logcat);
    expect(crashes).toHaveLength(1);
    expect(crashes[0].type).toBe('AndroidRuntime');
    expect(crashes[0].exception).toBe('java.lang.NullPointerException');
    expect(crashes[0].message).toContain('Attempt to read from null object');
    expect(crashes[0].stackTrace.length).toBeGreaterThanOrEqual(3);
  });

  it('extracts iOS native EXC_CRASH / SIGABRT crash signals', () => {
    const crashReport = `
Process:               NexusClient [4521]
Identifier:            com.nexus.ios
Exception Type:        EXC_CRASH (SIGABRT)
Exception Codes:       0x0000000000000000, 0x0000000000000000
Termination Reason:    SIGNAL 6 Abort trap: 6
Triggered by Thread:   0

Thread 0 Crashed:
0   libsystem_kernel.dylib         0x00007fff20355462 __pthread_kill + 10
1   libsystem_c.dylib              0x00007fff202d9411 abort + 120
    `;
    const crashes = parseMobileCrashLogs(crashReport);
    expect(crashes).toHaveLength(1);
    expect(crashes[0].type).toBe('iOSCrash');
    expect(crashes[0].exception).toBe('EXC_CRASH (SIGABRT)');
    expect(crashes[0].message).toContain('SIGNAL 6 Abort trap: 6');
  });
});

describe('Mobile Lane Execution & Mode Guard Boundary', () => {
  it('passes cleanly for a hardened Android app in sandbox mode', async () => {
    const context = createMockContext();
    const result = await runMobileLane(context);

    expect(result.lane).toBe('mobile');
    expect(result.status).toBe('passed');
    expect(result.findings).toHaveLength(0);
    expect(result.tests.some((t) => t.id === 'MOB-TC-001' && t.status === 'passed')).toBe(true);
    expect(result.tests.some((t) => t.id === 'MOB-TC-002' && t.status === 'passed')).toBe(true);
  });

  it('flags debuggable build with critical finding', async () => {
    const context = createMockContext({
      mode: 'staging',
      request: {
        name: 'staging-mobile',
        mode: 'staging',
        scope: 'standard',
        planApproval: 'auto',
        mobile: {
          platform: 'android',
          bundleId: 'com.nexus.app',
          appPath: 'app-staging.apk',
          framework: 'maestro',
          manifestXml: '<manifest><application android:debuggable="true"></application></manifest>',
        },
      },
    });

    const result = await runMobileLane(context);
    expect(result.status).toBe('failed');
    const debuggableFinding = result.findings.find((f) => f.id === 'F-MOB-002');
    expect(debuggableFinding).toBeDefined();
    expect(debuggableFinding?.severity).toBe('critical');
  });

  it('enforces Mode Guard in prod-safe mode by blocking live device execution', async () => {
    const context = createMockContext({
      mode: 'prod-safe',
      request: {
        name: 'prod-mobile-audit',
        mode: 'prod-safe',
        scope: 'quick',
        planApproval: 'auto',
        mobile: {
          platform: 'android',
          bundleId: 'com.nexus.app',
          appPath: 'app-prod.apk',
          framework: 'maestro',
          deviceType: 'physical',
        },
      },
    });

    const result = await runMobileLane(context);
    expect(result.lane).toBe('mobile');
    // Static audit tests run
    expect(result.tests.some((t) => t.id === 'MOB-TC-001' && t.status === 'passed')).toBe(true);
    // Dynamic test is strictly skipped by Mode Guard
    const liveTest = result.tests.find((t) => t.id === 'MOB-TC-005');
    expect(liveTest).toBeDefined();
    expect(liveTest?.status).toBe('skipped');
    expect(liveTest?.reason).toContain('prod-safe mode');
  });

  it('catches application crash logs and creates critical finding', async () => {
    const context = createMockContext({
      request: {
        name: 'crash-mobile',
        mode: 'sandbox',
        scope: 'quick',
        planApproval: 'auto',
        mobile: {
          platform: 'android',
          bundleId: 'com.nexus.app',
          appPath: 'app.apk',
          framework: 'maestro',
          manifestXml: '<manifest><application MOCK_CRASH_LOGCAT="true"></application></manifest>',
        },
      },
    });

    const result = await runMobileLane(context);
    expect(result.status).toBe('failed');
    const crashFinding = result.findings.find((f) => f.id === 'F-MOB-CRASH');
    expect(crashFinding).toBeDefined();
    expect(crashFinding?.severity).toBe('critical');
    expect(crashFinding?.category).toBe('app-bug');
  });

  it('runs seamlessly inside runLanes scheduler orchestration', async () => {
    const context = createMockContext();
    const runResult = await runLanes(context, ['mobile']);

    expect(runResult.lanes).toHaveLength(1);
    expect(runResult.lanes[0].lane).toBe('mobile');
    expect(runResult.totals.tests).toBeGreaterThan(0);
    expect(runResult.totals.failed).toBe(0);
  });
});
