export const SCENARIOS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CONGESTED', 'RECOVERY']);

const SCENARIO_TARGETS = Object.freeze({
  LOW: {
    vehiclesPerMinute: [8, 25],
    averageSpeed: [45, 58],
    occupancy: [10, 30],
  },
  MEDIUM: {
    vehiclesPerMinute: [25, 50],
    averageSpeed: [30, 45],
    occupancy: [30, 60],
  },
  HIGH: {
    vehiclesPerMinute: [48, 75],
    averageSpeed: [18, 32],
    occupancy: [60, 82],
  },
  CONGESTED: {
    vehiclesPerMinute: [60, 95],
    averageSpeed: [4, 14],
    occupancy: [88, 100],
  },
  RECOVERY: {
    vehiclesPerMinute: [30, 55],
    averageSpeed: [20, 40],
    occupancy: [45, 70],
  },
});

const MAX_STEP = Object.freeze({
  vehiclesPerMinute: 8,
  averageSpeed: 6,
  occupancy: 8,
});

export class TrafficSimulator {
  constructor(sensors, { random = Math.random, scenarioCycles = 6 } = {}) {
    if (!Array.isArray(sensors) || sensors.length === 0) {
      throw new Error('TrafficSimulator necesita al menos un sensor');
    }

    this.sensors = sensors;
    this.random = random;
    this.scenarioCycles = scenarioCycles;
    this.states = new Map(sensors.map((sensor) => [sensor.id, createInitialState(sensor)]));
  }

  nextCycle(now = new Date()) {
    const observedAt = now.toISOString();
    return this.sensors.map((sensor) => this.#nextReading(sensor, observedAt));
  }

  forceScenario(scenario, sensorId = 'ALL', cycles = this.scenarioCycles) {
    if (!SCENARIOS.includes(scenario)) {
      throw new Error(`Escenario inválido: ${scenario}`);
    }
    if (!Number.isInteger(cycles) || cycles < 1) {
      throw new Error('cycles debe ser un entero positivo');
    }

    const targetSensors = sensorId === 'ALL'
      ? this.sensors
      : this.sensors.filter((sensor) => sensor.id === sensorId);

    if (targetSensors.length === 0) {
      throw new Error(`Sensor desconocido: ${sensorId}`);
    }

    for (const sensor of targetSensors) {
      const state = this.states.get(sensor.id);
      state.scenario = scenario;
      state.cyclesInScenario = 0;
      state.forcedCyclesRemaining = cycles;
    }
  }

  #nextReading(sensor, observedAt) {
    const state = this.states.get(sensor.id);
    const targets = SCENARIO_TARGETS[state.scenario];

    state.vehiclesPerMinute = moveTowards(
      state.vehiclesPerMinute,
      randomBetween(targets.vehiclesPerMinute, this.random),
      MAX_STEP.vehiclesPerMinute,
    );
    state.averageSpeed = moveTowards(
      state.averageSpeed,
      randomBetween(targets.averageSpeed, this.random),
      MAX_STEP.averageSpeed,
    );
    state.occupancy = moveTowards(
      state.occupancy,
      randomBetween(targets.occupancy, this.random),
      MAX_STEP.occupancy,
    );

    const reading = {
      sensorId: sensor.id,
      name: sensor.name,
      zone: sensor.zone,
      latitude: sensor.latitude,
      longitude: sensor.longitude,
      observedAt,
      vehiclesPerMinute: Math.round(clamp(state.vehiclesPerMinute, 0, 100)),
      averageSpeed: round(clamp(state.averageSpeed, 0, 60), 1),
      occupancy: round(clamp(state.occupancy, 0, 100), 1),
      averageTravelTime: calculateTravelTime(
        sensor.segment_length_km,
        state.averageSpeed,
        state.occupancy,
      ),
      congestion: deriveCongestion(state.averageSpeed, state.occupancy),
      scenario: state.scenario,
    };

    this.#advanceScenario(state);
    return reading;
  }

  #advanceScenario(state) {
    state.cyclesInScenario += 1;

    if (state.forcedCyclesRemaining > 0) {
      state.forcedCyclesRemaining -= 1;
      if (state.forcedCyclesRemaining === 0) {
        state.scenario = 'RECOVERY';
        state.cyclesInScenario = 0;
      }
      return;
    }

    if (state.cyclesInScenario >= this.scenarioCycles) {
      const currentIndex = SCENARIOS.indexOf(state.scenario);
      state.scenario = SCENARIOS[(currentIndex + 1) % SCENARIOS.length];
      state.cyclesInScenario = 0;
    }
  }
}

export function calculateTravelTime(segmentLengthKm, averageSpeed, occupancy) {
  const effectiveSpeed = Math.max(averageSpeed, 5);
  const baseMinutes = (segmentLengthKm / effectiveSpeed) * 60;
  return round(clamp(baseMinutes * (1 + occupancy / 200), 1, 15), 1);
}

export function deriveCongestion(averageSpeed, occupancy) {
  if (occupancy >= 80 || averageSpeed < 20) {
    return 'HIGH';
  }
  if (occupancy >= 45 || averageSpeed < 40) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function createInitialState(sensor) {
  const targets = SCENARIO_TARGETS[sensor.initial_scenario];
  return {
    scenario: sensor.initial_scenario,
    vehiclesPerMinute: midpoint(targets.vehiclesPerMinute),
    averageSpeed: midpoint(targets.averageSpeed),
    occupancy: midpoint(targets.occupancy),
    cyclesInScenario: 0,
    forcedCyclesRemaining: 0,
  };
}

function moveTowards(current, target, maximumStep) {
  const difference = target - current;
  return current + clamp(difference, -maximumStep, maximumStep);
}

function randomBetween([minimum, maximum], random) {
  return minimum + random() * (maximum - minimum);
}

function midpoint([minimum, maximum]) {
  return (minimum + maximum) / 2;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
