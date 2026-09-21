import { createClient } from 'redis';

import { config } from '../shared/config.js';
import { KEYS } from '../shared/keys.js';
import { loadSensors } from '../shared/sensors.js';

const redis = createClient({ url: config.redisUrl });
const sensors = await loadSensors();

function fail(message) {
  throw new Error(`Verificacion fallida: ${message}`);
}

try {
  await redis.connect();

  const states = await Promise.all(
    sensors.map((sensor) => redis.hGetAll(KEYS.sensorState(sensor.id))),
  );
  const missingSensors = sensors
    .filter((_, index) => Object.keys(states[index]).length === 0)
    .map((sensor) => sensor.id);

  if (missingSensors.length > 0) {
    fail(`faltan estados para ${missingSensors.join(', ')}`);
  }

  const streamLength = await redis.xLen(KEYS.trafficStream);
  if (streamLength === 0) {
    fail('traffic:stream no contiene eventos');
  }

  const globalMetrics = await redis.hGetAll(KEYS.globalMetrics);
  const requiredMetrics = [
    'average_network_speed',
    'total_vehicles_per_minute',
    'average_occupancy',
    'busiest_sensor',
  ];
  const missingMetrics = requiredMetrics.filter((metric) => !(metric in globalMetrics));
  if (missingMetrics.length > 0) {
    fail(`faltan metricas globales: ${missingMetrics.join(', ')}`);
  }

  const ranking = await redis.zRangeWithScores(KEYS.occupancyRanking, 0, -1);
  if (ranking.length !== sensors.length) {
    fail(`el ranking contiene ${ranking.length} sensores y se esperaban ${sensors.length}`);
  }

  const activeAlerts = (
    await Promise.all(
      sensors.map(async (sensor) => ({
        sensorId: sensor.id,
        ttl: await redis.ttl(KEYS.sensorAlert(sensor.id)),
      })),
    )
  ).filter(({ ttl }) => ttl > 0);

  console.log('Flujo Redis verificado correctamente.');
  console.table({
    sensores_con_estado: states.length,
    eventos_en_stream: streamLength,
    sensores_en_ranking: ranking.length,
    alertas_activas: activeAlerts.length,
  });
  console.log('Metricas globales:', globalMetrics);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (redis.isOpen) {
    await redis.quit();
  }
}
