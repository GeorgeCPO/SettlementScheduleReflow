import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReflowInput } from '../reflow/types.ts';

export interface Scenario extends ReflowInput {
  name: string;
  description: string[];
}

const SCENARIOS_DIR = join(import.meta.dirname, '../../data/scenarios');

/** Scenario ids are the JSON file names in data/scenarios without the extension, e.g. "01-delay-cascade". */
export function listScenarioIds(): string[] {
  return readdirSync(SCENARIOS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort();
}

/** Loads a scenario by id (".json" optional). The JSON is trusted to match the types (no runtime validation). */
export function loadScenario(id: string): Scenario {
  const path = join(SCENARIOS_DIR, id.endsWith('.json') ? id : `${id}.json`);

  if (!existsSync(path)) {
    throw new Error(`Unknown scenario "${id}". Available: ${listScenarioIds().join(', ')}`);
  }

  return JSON.parse(readFileSync(path, 'utf8')) as Scenario;
}
