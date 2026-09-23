// Esta función es usada por index.js y recibe 2 numeros, el valor actual de vehículos por minuto
// y el valor anterior de vehículos por minuto (ciclo pasado).
export function calculateFlowVariation(currentVehiclesPerMinute, previousVehiclesPerMinute) {
  if (!Number.isFinite(previousVehiclesPerMinute)) {
    return { absolute: 0, percentage: 0 };
  } // Si el valor anterior NO es un numero valido, se retorna 0 en ambos valores y se usa especialmenye 
    // para la primera vez que un sensor manda datos, ya que no hay un valor anterior para comparar.

  const absolute = currentVehiclesPerMinute - previousVehiclesPerMinute; // const no cambia despues de ser creada, aquí hay una resta simple de valor actual menos valor anterior para ver la diferencia en el flujo de los vehículos.
  const percentage = previousVehiclesPerMinute === 0 // esto se hace para que el resultado de 0 si el valor anterior es 0, ya que no se puede dividir entre 0.
    ? 0
    : (absolute / previousVehiclesPerMinute) * 100; // si no es 0 se realiza el calculo del porcentaje de variación, que es la diferencia absoluta entre el valor actual
                                                    // y el valor anterior, dividido entre el valor anterior y multiplicado por 100 para obtener el porcentaje.
  return {
    absolute,
    percentage: round(percentage, 1), // se redondea el porcentaje a 1 decimal para que sea más legible y se retorna un objeto con los valores calculados.
    // lo que hace la función es responder cuánto y qué porcentaje cambió el tráfico de un sensor, comparado con su lectura anterior.
  };
}

// Esta función calcula las metricas de toda la red de sensores (todos los sensores juntos), no de uno solo.
// recibe una lista de estados de los sensores, cada elemento tiene averageSpeed, vehiclesPerMinute y occupancy.
export function calculateNetworkMetrics(sensorStates) {
  const validStates = sensorStates.filter((state) => ( // filter se usa para crear una nueva lista con los elementos que cumplan una condición. 
    state 
    && Number.isFinite(state.averageSpeed)
    && Number.isFinite(state.vehiclesPerMinute)
    && Number.isFinite(state.occupancy)  // la condicipon dice que se quede solo con los estados que existan, tengan velocidad valida, vehículos valido y ocupación válida. Para que no haya problema con sensores vacíos.
  ));

  if (validStates.length === 0) { // Si despues de filtrar no hay sensores validos se devuelve null, para que no haya problemas al calcular. 
    return null;
  }

  const totals = validStates.reduce((accumulator, state) => ({ // reduce se usa para acumular valores de una lista en un solo valor, empiezan en 0 y se les va sumando los valores de cada estado.
    speed: accumulator.speed + state.averageSpeed,             // totals tiene la suma total de la velocidad, los vehículos y la ocupación. 
    vehicles: accumulator.vehicles + state.vehiclesPerMinute,
    occupancy: accumulator.occupancy + state.occupancy,
  }), { speed: 0, vehicles: 0, occupancy: 0 });

  const busiest = validStates.reduce((current, candidate) => ( // el reduce en este caso no tiene valor inicial, se usa para ir comparando de a dos, current (el valor ganador hasta ahora) y candidate (el siguiente en la lista)
    candidate.occupancy > current.occupancy ? candidate : current // si el candidato tiene mayor ocupación que el actual, se convierte en el nuevo ganador, si no, se mantiene el ganador. 
  ));                                                             // Al final del reduce, busiest tendrá el estado con mayor ocupación.

  return {
    averageNetworkSpeed: round(totals.speed / validStates.length, 1), // velocidad promedio de la red, suma total/cantidad de sensores, redondeando a 1 decimal.
    totalVehiclesPerMinute: Math.round(totals.vehicles), // lo rendondea a un numero entero, porque no tiene sentido tener vehículos en decimales. 
    averageOccupancy: round(totals.occupancy / validStates.length, 1), // lo mismo que en velocidad promedio, pero con la ocupación.
    busiestSensor: busiest.entityId,
    busiestOccupancy: round(busiest.occupancy, 1),
    availableSensors: validStates.length,
  };
} // Devuelve un objeto con las 6 metricas de los sensores, respondiendo a la pregunta ¿como está el trafico general en la ciudad y cual es el punto más crítico?


// Crea un array vacío donde se van a ir agregando las alertas que se apliquen.
export function evaluateAlerts(event) {
  const alerts = [];

  if (event.data.occupancy > 90) { // es la ocupación del evento que acaba de llegar, si es mayor a 90:
    alerts.push({ // Si es mayor a 90, push agrega un objeto al array de alertas, 
      type: 'HIGH_CONGESTION', // con el tipo de alerta, 
      message: 'Ocupación superior al 90%', // un mensaje, 
      observed_value: event.data.occupancy, // valor observado, 
      threshold: 90, // el umbral que cruzó 
      unit: '%', // y la unidad de medida
    });
  } 

  if (event.data.average_speed < 10) { // misma logica que la anterior, pero para la velocidad promedio, si es menor a 10 km/h, se agrega una alerta de velocidad crítica.
    alerts.push({ // es un if aparte porque se pueden disparar ambas alertas en el mismo evento.
      type: 'CRITICAL_SPEED',
      message: 'Velocidad promedio inferior a 10 km/h',
      observed_value: event.data.average_speed,
      threshold: 10,
      unit: 'km/h',
    });
  }

  return alerts; // el array que devuelve puede tener 0, 1 o 2 alertas.
}

// se usa solo dentro de este archivo.
function round(value, decimals) {
  const factor = 10 ** decimals; // 10 elevado a la cantidad de decimales que se quiere redondear, por ejemplo si es 1, factor = 10, si es 2, factor = 100.
  return Math.round(value * factor) / factor; // se multiplica el valor por el factor, se redondea y se divide por el factor, para obtener el valor redondeado a la cantidad de decimales deseada.
} // Ejemplo: redondear 27.36 a 1 decimal - 27.36 * 10 = 273.6, Math.round(273.6) = 274, 274 / 10 = 27.4
