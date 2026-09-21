function readPositiveInteger(name, fallback, minimum = 1) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} debe ser un entero mayor o igual a ${minimum}`);
  }

  return value;
}

export const config = Object.freeze({
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  simulationIntervalMs: readPositiveInteger('SIMULATION_INTERVAL_MS', 10_000, 1_000),
  streamMaxLength: readPositiveInteger('STREAM_MAX_LENGTH', 360, 10),
  alertTtlSeconds: readPositiveInteger('ALERT_TTL_SECONDS', 60, 1),
  scenarioCycles: readPositiveInteger('SCENARIO_CYCLES', 6, 1),
});
