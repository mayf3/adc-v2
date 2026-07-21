import { describe, expect, it } from 'vitest';

import { loadV2Config } from './config.js';

const binding = {
  scenarioKey: 'development-delivery',
  displayName: 'Development delivery',
  domainId: '11111111-1111-4111-8111-111111111111',
  definitionVersionId: '22222222-2222-4222-8222-222222222222',
  definitionDigest: 'sha256:test-definition',
};

describe('ADC V2 config', () => {
  it('loads a controlled immutable definition binding without any database setting', () => {
    const config = loadV2Config({
      NODE_ENV: 'test',
      ADC_V2_DEFINITION_BINDINGS_JSON: JSON.stringify([binding]),
      SVC_WORKFLOW_BASE_URL: 'http://127.0.0.1:8989',
    });

    expect(config.definitionBindings).toEqual([binding]);
    expect(Object.isFrozen(config.definitionBindings)).toBe(true);
    expect(Object.isFrozen(config.definitionBindings[0])).toBe(true);
    expect(config).not.toHaveProperty('databaseUrl');
    expect(config.port).toBe(4100);
  });

  it('rejects duplicate scenario keys', () => {
    expect(() => loadV2Config({
      NODE_ENV: 'test',
      ADC_V2_DEFINITION_BINDINGS_JSON: JSON.stringify([binding, binding]),
    })).toThrow('duplicate ADC V2 scenario key');
  });
});
