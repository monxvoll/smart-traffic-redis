import { createClient } from 'redis';
import { config } from '../shared/config.js';
import { CHANNELS } from '../shared/keys.js';
import { SCENARIOS } from '../simulator/traffic-simulator.js';

const scenario = String(process.argv[2] ?? '').toUpperCase();
const sensorId = String(process.argv[3] ?? 'ALL').toUpperCase();
const cycles = Number(process.argv[4] ?? config.scenarioCycles);

if (!SCENARIOS.includes(scenario)) {
  console.error(`Uso: npm run scenario -- <${SCENARIOS.join('|')}> [TRAF-01|ALL] [ciclos]`);
  process.exit(1);
}

if (!Number.isInteger(cycles) || cycles < 1) {
  console.error('Los ciclos deben ser un entero positivo');
  process.exit(1);
}

const redis = createClient({ url: config.redisUrl });
redis.on('error', (error) => console.error('[scenario] Redis:', error.message));

try {
  await redis.connect();
  const receivers = await redis.publish(CHANNELS.trafficControl, JSON.stringify({
    scenario,
    sensor_id: sensorId,
    cycles,
  }));

  console.log(`Escenario ${scenario} enviado a ${sensorId}; subscribers=${receivers}`);
  if (receivers === 0) {
    console.warn('El Publisher no está escuchando el canal de control');
  }
} finally {
  if (redis.isOpen) await redis.quit();
}
