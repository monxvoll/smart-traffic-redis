export function calculateFlowVariation(currentVehiclesPerMinute, previousVehiclesPerMinute) {
  if (!Number.isFinite(previousVehiclesPerMinute)) {
    return { absolute: 0, percentage: 0 };
  }

  const absolute = currentVehiclesPerMinute - previousVehiclesPerMinute;
  const percentage = previousVehiclesPerMinute === 0
    ? 0
    : (absolute / previousVehiclesPerMinute) * 100;

  return {
    absolute,
    percentage: round(percentage, 1),
  };
}

export function calculateNetworkMetrics(sensorStates) {
  const validStates = sensorStates.filter((state) => (
    state
    && Number.isFinite(state.averageSpeed)
    && Number.isFinite(state.vehiclesPerMinute)
    && Number.isFinite(state.occupancy)
  ));

  if (validStates.length === 0) {
    return null;
  }

  const totals = validStates.reduce((accumulator, state) => ({
    speed: accumulator.speed + state.averageSpeed,
    vehicles: accumulator.vehicles + state.vehiclesPerMinute,
    occupancy: accumulator.occupancy + state.occupancy,
  }), { speed: 0, vehicles: 0, occupancy: 0 });

  const busiest = validStates.reduce((current, candidate) => (
    candidate.occupancy > current.occupancy ? candidate : current
  ));

  return {
    averageNetworkSpeed: round(totals.speed / validStates.length, 1),
    totalVehiclesPerMinute: Math.round(totals.vehicles),
    averageOccupancy: round(totals.occupancy / validStates.length, 1),
    busiestSensor: busiest.entityId,
    busiestOccupancy: round(busiest.occupancy, 1),
    availableSensors: validStates.length,
  };
}

export function evaluateAlerts(event) {
  const alerts = [];

  if (event.data.occupancy > 90) {
    alerts.push({
      type: 'HIGH_CONGESTION',
      message: 'Ocupación superior al 90%',
      observed_value: event.data.occupancy,
      threshold: 90,
      unit: '%',
    });
  }

  if (event.data.average_speed < 10) {
    alerts.push({
      type: 'CRITICAL_SPEED',
      message: 'Velocidad promedio inferior a 10 km/h',
      observed_value: event.data.average_speed,
      threshold: 10,
      unit: 'km/h',
    });
  }

  return alerts;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
