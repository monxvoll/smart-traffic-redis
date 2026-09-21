export const CHANNELS = Object.freeze({
  trafficEvents: 'traffic-events',
  trafficControl: 'traffic-control',
});

export const KEYS = Object.freeze({
  trafficStream: 'traffic:stream',
  occupancyRanking: 'traffic:ranking:occupancy',
  globalMetrics: 'traffic:metrics:global',
  lastVehiclesPerMinute: 'traffic:metrics:last-vpm',
  sensorState: (sensorId) => `sensor:traffic:${sensorId}`,
  sensorMetrics: (sensorId) => `traffic:metrics:sensor:${sensorId}`,
  sensorAlert: (sensorId) => `traffic:alert:${sensorId}`,
});
