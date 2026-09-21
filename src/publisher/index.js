import { createClient } from 'redis';
import { config } from '../shared/config.js';
import { CHANNELS, KEYS } from '../shared/keys.js';
import { loadSensors } from '../shared/sensors.js';
import { buildTrafficEvent, flattenTrafficEvent } from '../shared/traffic-event.js';
import { SCENARIOS, TrafficSimulator } from '../simulator/traffic-simulator.js';

const redis = createClient({ url: config.redisUrl });
const controlSubscriber = redis.duplicate();

redis.on('error', (error) => console.error('[publisher] Redis:', error.message));
controlSubscriber.on('error', (error) => console.error('[publisher/control] Redis:', error.message));

let timer;
let stopping = false;

async function main() {
  const sensors = await loadSensors();
  const simulator = new TrafficSimulator(sensors, { scenarioCycles: config.scenarioCycles });

  await Promise.all([redis.connect(), controlSubscriber.connect()]);
  await controlSubscriber.subscribe(CHANNELS.trafficControl, (message) => {
    handleControlMessage(simulator, message);
  });

  console.log(
    `[publisher] Iniciado con ${sensors.length} sensores, intervalo ${config.simulationIntervalMs} ms`,
  );

  const publishLoop = async () => {
    if (stopping) return;

    const cycleStartedAt = new Date();
    try {
      const readings = simulator.nextCycle(cycleStartedAt);
      for (const reading of readings) {
        await publishReading(reading);
      }
      console.log(
        `[publisher] Ciclo ${cycleStartedAt.toISOString()} publicado (${readings.length} eventos)`,
      );
    } catch (error) {
      console.error('[publisher] Error en ciclo:', error);
    } finally {
      if (!stopping) {
        timer = setTimeout(publishLoop, config.simulationIntervalMs);
      }
    }
  };

  await publishLoop();
}

async function publishReading(reading) {
  const event = buildTrafficEvent(reading);
  const flatEvent = flattenTrafficEvent(event);
  const transaction = redis.multi();

  transaction.hSet(KEYS.sensorState(event.entity_id), flatEvent);
  transaction.xAdd(KEYS.trafficStream, '*', flatEvent, {
    TRIM: {
      strategy: 'MAXLEN',
      strategyModifier: '~',
      threshold: config.streamMaxLength,
    },
  });
  transaction.publish(CHANNELS.trafficEvents, JSON.stringify(event));

  await transaction.exec();
}

function handleControlMessage(simulator, rawMessage) {
  try {
    const command = JSON.parse(rawMessage);
    const scenario = String(command.scenario ?? '').toUpperCase();
    const sensorId = String(command.sensor_id ?? 'ALL').toUpperCase();
    const cycles = Number(command.cycles ?? config.scenarioCycles);

    if (!SCENARIOS.includes(scenario)) {
      throw new Error(`scenario debe ser uno de: ${SCENARIOS.join(', ')}`);
    }

    simulator.forceScenario(scenario, sensorId, cycles);
    console.log(`[publisher] Escenario ${scenario} forzado para ${sensorId} durante ${cycles} ciclos`);
  } catch (error) {
    console.error('[publisher] Orden de control inválida:', error.message);
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  console.log(`[publisher] Cerrando por ${signal}`);

  await Promise.allSettled([
    controlSubscriber.isOpen ? controlSubscriber.quit() : undefined,
    redis.isOpen ? redis.quit() : undefined,
  ]);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal).finally(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error('[publisher] No pudo iniciar:', error);
  process.exitCode = 1;
});
