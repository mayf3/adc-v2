import { describe, expect, it } from 'vitest';

import {
  WORKFLOW_SDK_FEATURE_FLAG_DEFAULTS,
  WorkflowWriteDisabledError,
  loadWorkflowSdkFeatureFlags,
  requireWriteEnabled,
} from './feature-flags.js';

describe('loadWorkflowSdkFeatureFlags', () => {
  it('returns all defaults when no env vars are set', () => {
    const flags = loadWorkflowSdkFeatureFlags({});
    expect(flags.sdkV1Enabled).toBe(false);
    expect(flags.realOboEnabled).toBe(false);
    expect(flags.authV1ResourceServerEnabled).toBe(false);
    expect(flags.writeEnabled).toBe(false);
    expect(flags.oboReadCanaryEnabled).toBe(false);
  });

  it('leaves defaults as false when env vars are falsy', () => {
    const flags = loadWorkflowSdkFeatureFlags({
      ADC_WORKFLOW_SDK_V1_ENABLED: '0',
      ADC_WORKFLOW_REAL_OBO_ENABLED: 'false',
      ADC_AUTH_V1_RESOURCE_SERVER_ENABLED: 'no',
      ADC_WORKFLOW_WRITE_ENABLED: 'off',
      ADC_WORKFLOW_OBO_READ_CANARY_ENABLED: '0',
    });
    expect(flags.sdkV1Enabled).toBe(false);
    expect(flags.realOboEnabled).toBe(false);
    expect(flags.authV1ResourceServerEnabled).toBe(false);
    expect(flags.writeEnabled).toBe(false);
  });

  it('enables flags for truthy values: 1', () => {
    const flags = loadWorkflowSdkFeatureFlags({
      ADC_WORKFLOW_SDK_V1_ENABLED: '1',
      ADC_WORKFLOW_WRITE_ENABLED: '1',
    });
    expect(flags.sdkV1Enabled).toBe(true);
    expect(flags.writeEnabled).toBe(true);
  });

  it('enables flags for truthy values: true', () => {
    const flags = loadWorkflowSdkFeatureFlags({
      ADC_WORKFLOW_REAL_OBO_ENABLED: 'true',
    });
    expect(flags.realOboEnabled).toBe(true);
  });

  it('enables flags for truthy values: yes', () => {
    const flags = loadWorkflowSdkFeatureFlags({
      ADC_AUTH_V1_RESOURCE_SERVER_ENABLED: 'yes',
    });
    expect(flags.authV1ResourceServerEnabled).toBe(true);
  });

  it('returns frozen objects', () => {
    const flags = loadWorkflowSdkFeatureFlags({});
    expect(Object.isFrozen(flags)).toBe(true);
  });
});

describe('requireWriteEnabled', () => {
  it('does not throw when writeEnabled is true', () => {
    expect(() =>
      requireWriteEnabled({
        ...WORKFLOW_SDK_FEATURE_FLAG_DEFAULTS,
        writeEnabled: true,
      }),
    ).not.toThrow();
  });

  it('throws WorkflowWriteDisabledError when writeEnabled is false', () => {
    expect(() =>
      requireWriteEnabled({
        ...WORKFLOW_SDK_FEATURE_FLAG_DEFAULTS,
        writeEnabled: false,
      }),
    ).toThrow(WorkflowWriteDisabledError);
  });

  it('throws with code ADC_WORKFLOW_WRITE_DISABLED', () => {
    try {
      requireWriteEnabled({ ...WORKFLOW_SDK_FEATURE_FLAG_DEFAULTS, writeEnabled: false });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowWriteDisabledError);
      expect((error as WorkflowWriteDisabledError).code).toBe('ADC_WORKFLOW_WRITE_DISABLED');
    }
  });
});
