import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrafficEvent,
  flattenTrafficEvent,
  validateTrafficEvent,
} from '../src/shared/traffic-event.js';

const validReading = {
  sensorId: 'TRAF-01',
  name: 'Punto simulado Centro',
  zone: 'CENTRO',
  latitude: 5.71495,
  longitude: -72.92835,
  observedAt: '2026-09-20T12:00:00.000Z',
  vehiclesPerMinute: 48,
  averageSpeed: 22.4,
  occupancy: 81.2,
  averageTravelTime: 7.8,
  congestion: 'HIGH',
};

test('construye el contrato JSON obligatorio', () => {
  const event = buildTrafficEvent(validReading);

  assert.equal(event.entity_id, 'TRAF-01');
  assert.equal(event.location.latitude, 5.71495);
  assert.equal(event.data.vehicles_per_minute, 48);
  assert.equal(validateTrafficEvent(event).length, 0);
});

test('aplana el evento para Hashes y Streams', () => {
  const flat = flattenTrafficEvent(buildTrafficEvent(validReading));

  assert.equal(flat.entity_id, 'TRAF-01');
  assert.equal(flat.average_speed, '22.4');
  assert.equal(flat.latitude, '5.71495');
  assert.equal(typeof flat.occupancy, 'string');
});

test('rechaza mediciones fuera de rango', () => {
  const event = buildTrafficEvent(validReading);
  event.data.occupancy = 150;

  assert.match(validateTrafficEvent(event).join(' '), /occupancy/);
});
