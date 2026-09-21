import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSensors } from '../src/shared/sensors.js';
import {
  calculateTravelTime,
  deriveCongestion,
  TrafficSimulator,
} from '../src/simulator/traffic-simulator.js';

test('el simulador conserva rangos y limita cambios entre ciclos', async () => {
  const sensors = await loadSensors();
  const simulator = new TrafficSimulator(sensors, {
    random: () => 0.5,
    scenarioCycles: 2,
  });

  let previous = simulator.nextCycle(new Date('2026-09-20T12:00:00Z'));

  for (let cycle = 1; cycle <= 20; cycle += 1) {
    const current = simulator.nextCycle(new Date(`2026-09-20T12:00:${String(cycle).padStart(2, '0')}Z`));

    for (let index = 0; index < current.length; index += 1) {
      const reading = current[index];
      const before = previous[index];

      assert.ok(reading.vehiclesPerMinute >= 0 && reading.vehiclesPerMinute <= 100);
      assert.ok(reading.averageSpeed >= 0 && reading.averageSpeed <= 60);
      assert.ok(reading.occupancy >= 0 && reading.occupancy <= 100);
      assert.ok(reading.averageTravelTime >= 1 && reading.averageTravelTime <= 15);
      assert.ok(Math.abs(reading.vehiclesPerMinute - before.vehiclesPerMinute) <= 8);
      assert.ok(Math.abs(reading.averageSpeed - before.averageSpeed) <= 6);
      assert.ok(Math.abs(reading.occupancy - before.occupancy) <= 8);
    }

    previous = current;
  }
});

test('un escenario forzado afecta solo al sensor seleccionado', async () => {
  const sensors = await loadSensors();
  const simulator = new TrafficSimulator(sensors, { random: () => 0.5, scenarioCycles: 10 });

  simulator.forceScenario('CONGESTED', 'TRAF-01', 2);
  const readings = simulator.nextCycle(new Date('2026-09-20T12:00:00Z'));

  assert.equal(readings.find((reading) => reading.sensorId === 'TRAF-01').scenario, 'CONGESTED');
  assert.equal(readings.find((reading) => reading.sensorId === 'TRAF-02').scenario, 'MEDIUM');
});

test('el tiempo de viaje aumenta con menor velocidad y mayor ocupación', () => {
  const normal = calculateTravelTime(1.5, 45, 25);
  const congested = calculateTravelTime(1.5, 10, 95);

  assert.ok(congested > normal);
});

test('la congestión se deriva de velocidad y ocupación', () => {
  assert.equal(deriveCongestion(50, 20), 'LOW');
  assert.equal(deriveCongestion(35, 50), 'MEDIUM');
  assert.equal(deriveCongestion(12, 95), 'HIGH');
});
