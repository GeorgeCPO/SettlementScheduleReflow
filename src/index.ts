import { ReflowService } from './reflow/reflow.service.ts';
import { listScenarioIds, loadScenario } from './scenarios/load-scenario.ts';

// Usage: npm start                          → runs every scenario in data/scenarios
//        npm run scenario -- <scenario-id>  → runs a single one, e.g. 01-delay-cascade
const requestedId = process.argv[2];
const scenarioIds = requestedId ? [requestedId] : listScenarioIds();

const reflowService = new ReflowService();

// Each scenario succeeds or fails on its own, so one impossible schedule doesn't hide the rest.
for (const id of scenarioIds) {
  try {
    // An unknown id throws here, before there is a heading to print.
    const scenario = loadScenario(id);
    console.log(`\n=== ${scenario.name} ===`);

    const result = reflowService.reflow(scenario);
    for (const task of result.updatedTasks) {
      console.log(`${task.data.taskReference}  ${task.data.startDate} → ${task.data.endDate}`);

      const changeIndex = result.changes.findIndex((change) => change.taskReference === task.data.taskReference);
      console.log(changeIndex === -1 ? '  unchanged' : `  ${result.explanation[changeIndex]}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    // Keep going, but make the run fail so the error isn't silent.
    process.exitCode = 1;
  }
}
