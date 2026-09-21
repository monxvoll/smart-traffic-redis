import { randomUUID } from 'node:crypto';

const CONGESTION_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH']);

export function buildTrafficEvent(reading) {
  const event = {
    event_id: randomUUID(),
    entity_id: reading.sensorId,
    timestamp: reading.observedAt,
    source: 'SIMULATOR',
    metadata: {
      name: reading.name,
      zone: reading.zone,
    },
    location: {
      latitude: reading.latitude,
      longitude: reading.longitude,
    },
    data: {
      vehicles_per_minute: reading.vehiclesPerMinute,
      average_speed: reading.averageSpeed,
      occupancy: reading.occupancy,
      average_travel_time: reading.averageTravelTime,
      congestion: reading.congestion,
    },
  };

  assertValidTrafficEvent(event);
  return event;
}

export function validateTrafficEvent(event) {
  const errors = [];

  if (typeof event?.event_id !== 'string' || event.event_id.length === 0) {
    errors.push('event_id es obligatorio');
  }
  if (!/^TRAF-\d{2}$/.test(event?.entity_id ?? '')) {
    errors.push('entity_id debe usar el formato TRAF-00');
  }
  if (Number.isNaN(Date.parse(event?.timestamp))) {
    errors.push('timestamp debe ser una fecha ISO 8601 válida');
  }
  if (event?.source !== 'SIMULATOR') {
    errors.push('source debe ser SIMULATOR en esta versión');
  }
  if (typeof event?.metadata?.name !== 'string' || typeof event?.metadata?.zone !== 'string') {
    errors.push('metadata debe incluir name y zone');
  }

  checkRange(errors, event?.location?.latitude, -90, 90, 'location.latitude');
  checkRange(errors, event?.location?.longitude, -180, 180, 'location.longitude');
  checkRange(errors, event?.data?.vehicles_per_minute, 0, 100, 'data.vehicles_per_minute');
  checkRange(errors, event?.data?.average_speed, 0, 60, 'data.average_speed');
  checkRange(errors, event?.data?.occupancy, 0, 100, 'data.occupancy');
  checkRange(errors, event?.data?.average_travel_time, 1, 15, 'data.average_travel_time');

  if (!CONGESTION_LEVELS.has(event?.data?.congestion)) {
    errors.push('data.congestion debe ser LOW, MEDIUM o HIGH');
  }

  return errors;
}

export function assertValidTrafficEvent(event) {
  const errors = validateTrafficEvent(event);
  if (errors.length > 0) {
    throw new Error(`Evento de tráfico inválido: ${errors.join('; ')}`);
  }
}

export function flattenTrafficEvent(event) {
  assertValidTrafficEvent(event);

  return Object.fromEntries(
    Object.entries({
      event_id: event.event_id,
      entity_id: event.entity_id,
      timestamp: event.timestamp,
      source: event.source,
      sensor_name: event.metadata.name,
      zone: event.metadata.zone,
      latitude: event.location.latitude,
      longitude: event.location.longitude,
      vehicles_per_minute: event.data.vehicles_per_minute,
      average_speed: event.data.average_speed,
      occupancy: event.data.occupancy,
      average_travel_time: event.data.average_travel_time,
      congestion: event.data.congestion,
    }).map(([key, value]) => [key, String(value)]),
  );
}

function checkRange(errors, value, minimum, maximum, field) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    errors.push(`${field} debe estar entre ${minimum} y ${maximum}`);
  }
}
