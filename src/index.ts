import { ReflowService } from './reflow/reflow.service.ts';
import { listScenarioIds, loadScenario } from './scenarios/load-scenario.ts';

// Usage: npm start                          → runs every scenario in data/scenarios
//        npm run scenario -- <scenario-id>  → runs a single one, e.g. 01-delay-cascade
const requestedId = process.argv[2];
const scenarioIds = requestedId ? [requestedId] : listScenarioIds();

const reflowService = new ReflowService();

try {
  for (const id of scenarioIds) {
    const scenario = loadScenario(id);
    const result = reflowService.reflow(scenario);

    console.log(`\n=== ${scenario.name} ===`);
    for (const task of result.updatedTasks) {
      console.log(`${task.data.taskReference}  ${task.data.startDate} → ${task.data.endDate}`);

      const changeIndex = result.changes.findIndex((change) => change.taskReference === task.data.taskReference);
      console.log(changeIndex === -1 ? '  unchanged' : `  ${result.explanation[changeIndex]}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
