import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFlowVariation,
  calculateNetworkMetrics,
  evaluateAlerts,
} from '../src/processor/metrics.js';

test('calcula variación absoluta y porcentual', () => {
  assert.deepEqual(calculateFlowVariation(60, 50), {
    absolute: 10,
    percentage: 20,
  });
  assert.deepEqual(calculateFlowVariation(15, Number.NaN), {
    absolute: 0,
    percentage: 0,
  });
});

test('calcula métricas globales y sensor más ocupado', () => {
  const metrics = calculateNetworkMetrics([
    { entityId: 'TRAF-01', averageSpeed: 40, vehiclesPerMinute: 30, occupancy: 25 },
    { entityId: 'TRAF-02', averageSpeed: 20, vehiclesPerMinute: 50, occupancy: 80 },
  ]);

  assert.equal(metrics.averageNetworkSpeed, 30);
  assert.equal(metrics.totalVehiclesPerMinute, 80);
  assert.equal(metrics.averageOccupancy, 52.5);
  assert.equal(metrics.busiestSensor, 'TRAF-02');
});

test('genera las dos alertas con sus umbrales', () => {
  const alerts = evaluateAlerts({
    data: {
      occupancy: 95,
      average_speed: 8,
    },
  });

  assert.deepEqual(alerts.map((alert) => alert.type), ['HIGH_CONGESTION', 'CRITICAL_SPEED']);
});
