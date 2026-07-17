import type { V2DefinitionBinding } from '../config.js';

export class DefinitionBindingRegistry {
  private readonly byScenarioKey: ReadonlyMap<string, V2DefinitionBinding>;

  constructor(private readonly bindings: readonly V2DefinitionBinding[]) {
    this.byScenarioKey = new Map(bindings.map((binding) => [binding.scenarioKey, binding]));
  }

  list(): readonly V2DefinitionBinding[] {
    return this.bindings;
  }

  resolve(scenarioKey: string): V2DefinitionBinding | undefined {
    return this.byScenarioKey.get(scenarioKey);
  }
}
