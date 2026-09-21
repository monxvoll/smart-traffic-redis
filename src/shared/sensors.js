import { readFile } from 'node:fs/promises';

const SENSORS_FILE = new URL('../../config/sensors.json', import.meta.url);
const VALID_SCENARIOS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CONGESTED', 'RECOVERY']);

export async function loadSensors() {
  const contents = await readFile(SENSORS_FILE, 'utf8');
  const sensors = JSON.parse(contents);

  if (!Array.isArray(sensors) || sensors.length === 0) {
    throw new Error('config/sensors.json debe contener al menos un sensor');
  }

  const ids = new Set();
  for (const sensor of sensors) {
    validateSensor(sensor);
    if (ids.has(sensor.id)) {
      throw new Error(`El sensor ${sensor.id} está duplicado`);
    }
    ids.add(sensor.id);
  }

  return sensors;
}

function validateSensor(sensor) {
  if (!/^TRAF-\d{2}$/.test(sensor.id ?? '')) {
    throw new Error(`Identificador de sensor inválido: ${sensor.id}`);
  }

  if (typeof sensor.name !== 'string' || typeof sensor.zone !== 'string') {
    throw new Error(`El sensor ${sensor.id} debe tener nombre y zona`);
  }

  if (!Number.isFinite(sensor.latitude) || sensor.latitude < -90 || sensor.latitude > 90) {
    throw new Error(`Latitud inválida para ${sensor.id}`);
  }

  if (!Number.isFinite(sensor.longitude) || sensor.longitude < -180 || sensor.longitude > 180) {
    throw new Error(`Longitud inválida para ${sensor.id}`);
  }

  if (!Number.isFinite(sensor.segment_length_km) || sensor.segment_length_km <= 0) {
    throw new Error(`Longitud de tramo inválida para ${sensor.id}`);
  }

  if (!VALID_SCENARIOS.has(sensor.initial_scenario)) {
    throw new Error(`Escenario inicial inválido para ${sensor.id}`);
  }
}
