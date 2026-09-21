import { createClient } from 'redis';
import { config } from '../shared/config.js';
import { CHANNELS, KEYS } from '../shared/keys.js';
import { loadSensors } from '../shared/sensors.js';
import { assertValidTrafficEvent } from '../shared/traffic-event.js';
import {
  calculateFlowVariation,
  calculateNetworkMetrics,
  evaluateAlerts,
} from './metrics.js';

const redis = createClient({ url: config.redisUrl });
const subscriber = redis.duplicate();

redis.on('error', (error) => console.error('[processor] Redis:', error.message));
subscriber.on('error', (error) => console.error('[processor/subscriber] Redis:', error.message));

let processingQueue = Promise.resolve();
let stopping = false;

async function main() {
  const sensors = await loadSensors();
  await Promise.all([redis.connect(), subscriber.connect()]);

  await subscriber.subscribe(CHANNELS.trafficEvents, (message) => {
    processingQueue = processingQueue
      .then(() => processMessage(message, sensors))
      .catch((error) => console.error('[processor] Evento rechazado:', error.message));
  });

  console.log(`[processor] Suscrito a ${CHANNELS.trafficEvents}`);
}

async function processMessage(message, sensors) {
  const event = JSON.parse(message);
  assertValidTrafficEvent(event);

  const previousRaw = await redis.hGet(KEYS.lastVehiclesPerMinute, event.entity_id);
  const previousVehiclesPerMinute = previousRaw === null ? Number.NaN : Number(previousRaw);
  const variation = calculateFlowVariation(
    event.data.vehicles_per_minute,
    previousVehiclesPerMinute,
  );
  const alerts = evaluateAlerts(event);

  const sensorStates = await readCurrentSensorStates(sensors);
  const networkMetrics = calculateNetworkMetrics(sensorStates);
  const transaction = redis.multi();

  transaction.hSet(
    KEYS.lastVehiclesPerMinute,
    event.entity_id,
    String(event.data.vehicles_per_minute),
  );
  transaction.hSet(KEYS.sensorMetrics(event.entity_id), {
    entity_id: event.entity_id,
    variation_vpm: String(variation.absolute),
    variation_percent: String(variation.percentage),
    updated_at: event.timestamp,
  });
  transaction.zAdd(KEYS.occupancyRanking, [{
    score: event.data.occupancy,
    value: event.entity_id,
  }]);

  if (networkMetrics) {
    transaction.hSet(KEYS.globalMetrics, {
      average_network_speed: String(networkMetrics.averageNetworkSpeed),
      total_vehicles_per_minute: String(networkMetrics.totalVehiclesPerMinute),
      average_occupancy: String(networkMetrics.averageOccupancy),
      busiest_sensor: networkMetrics.busiestSensor,
      busiest_occupancy: String(networkMetrics.busiestOccupancy),
      available_sensors: String(networkMetrics.availableSensors),
      updated_at: event.timestamp,
    });
  }

  const alertKey = KEYS.sensorAlert(event.entity_id);
  if (alerts.length > 0) {
    transaction.set(alertKey, JSON.stringify({
      entity_id: event.entity_id,
      timestamp: event.timestamp,
      alerts,
    }), { EX: config.alertTtlSeconds });
  } else {
    transaction.del(alertKey);
  }

  await transaction.exec();

  const alertSummary = alerts.length > 0
    ? ` | ALERTAS: ${alerts.map((alert) => alert.type).join(', ')}`
    : '';
  console.log(
    `[processor] ${event.entity_id} variación=${variation.absolute} veh/min${alertSummary}`,
  );
}

async function readCurrentSensorStates(sensors) {
  const states = await Promise.all(sensors.map(async (sensor) => {
    const state = await redis.hGetAll(KEYS.sensorState(sensor.id));
    if (Object.keys(state).length === 0) return null;

    return {
      entityId: sensor.id,
      averageSpeed: Number(state.average_speed),
      vehiclesPerMinute: Number(state.vehicles_per_minute),
      occupancy: Number(state.occupancy),
    };
  }));

  return states.filter(Boolean);
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[processor] Cerrando por ${signal}`);

  await processingQueue.catch(() => undefined);
  await Promise.allSettled([
    subscriber.isOpen ? subscriber.quit() : undefined,
    redis.isOpen ? redis.quit() : undefined,
  ]);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal).finally(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error('[processor] No pudo iniciar:', error);
  process.exitCode = 1;
});
