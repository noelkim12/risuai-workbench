import { parentPort, workerData } from 'node:worker_threads';

import type { RisuLuaEngineRequest } from './contracts';
import { runRisuLuaInProcess } from './fengari-engine';

if (!parentPort) throw new Error('RisuLua runtime Worker requires a parent port');

const result = runRisuLuaInProcess(workerData as RisuLuaEngineRequest);
parentPort.postMessage(result);
