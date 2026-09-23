import { createClient } from 'redis'; // trae la función createCliente para conectarse con el servidor de redis.
// estas vienen de shared o contrato de datos:
import { config } from '../shared/config.js'; // configuración general (URL de Redis, cuanto dura el TTL de las alertas, etc) 
import { CHANNELS, KEYS } from '../shared/keys.js'; // los nombres de los canales y las claves de Redis, para que no haya errores y se pueda cambiar en un solo lugar si se requiere.
import { loadSensors } from '../shared/sensors.js'; // esta función carga la lista de los 6 sensores.
import { assertValidTrafficEvent } from '../shared/traffic-event.js'; // aquí valida que un evento tenga el formato JSON correcto, si no lo tiene lanza un error y descarta eñ evento.
import {
  calculateFlowVariation,
  calculateNetworkMetrics,
  evaluateAlerts,
} from './metrics.js'; // importa las 3 funciones del archivo metrics.js.

const redis = createClient({ url: config.redisUrl }); // se crea la conexión a Redis usando la URL que viene de la configuración.
const subscriber = redis.duplicate(); // crea una segunda conexión independiente pero que se configura con la misma URL.
// Se usan dos conexiones ya que es una regla de redis, cuando una conexión está suscrita a un canal (SUSCRIBE), no puede usarse para otras operaciones
// Por eso suscriber se dedica solo a escuchar el canal, mientras que redis se usa para leer y escribir datos en Redis.


redis.on('error', (error) => console.error('[processor] Redis:', error.message)); // registra una función que se ejecuta cada vez que hay un error en la conexión de Redis (por ejemplo si se cae) e imprime el error en consola.
subscriber.on('error', (error) => console.error('[processor/subscriber] Redis:', error.message));

let processingQueue = Promise.resolve(); // crea una variable que si se puede cambiar, aquí se asegura de que los eventos se procesen uno a la vez y en orden, no mezclados, Promise es un punto de partida.
let stopping = false; // esta es una bandera de true o false para saber si el proceso se esta cerrando y no aceptar más eventos.

async function main() { // arranque del programa, puede esperar a que operaciones lentas terminen anyes de seguir, no bloquea el programa mientras espera.
  const sensors = await loadSensors(); // pausa esta función hasta que se cargue toda la lista de sensores que viene de shared/sensors.js y la guarda en sensors.
  await Promise.all([redis.connect(), subscriber.connect()]); // ejecuta varias operaciones al mismo tiempo y espera a que todas terminen, en este caso conecta las 2 conexiones de Redis (normal y suscripción) de forma simultanea.

  await subscriber.subscribe(CHANNELS.trafficEvents, (message) => { // "corazón del programa", se suscribe al canal traffic - events que se pide en el documento, cuando llega un mensaje al canal, Redis avisa y ejecuta la función que recibe el mensaje.
                                                                  // la función se ejecuta automáticamente, una vez por cada evento que publique el Publisher, message es el JSON del evento en forma de texto.
    processingQueue = processingQueue // Parte de procesar uno a la vez y en orden.
      .then(() => processMessage(message, sensors)) // cuando la promesa anterior termine ejecuta processMessage que encadena los eventos para que no se procesen de forma desordenada. 
      .catch((error) => console.error('[processor] Evento rechazado:', error.message)); // catch captura los errores que puedan aparecer y los imprime en consola sin detener el programa, así un evento malo no rompe el procesamiento de los siguientes. 
  });

  console.log(`[processor] Suscrito a ${CHANNELS.trafficEvents}`); // mensaje de que ya esta escuchando ${...} se usa para meter una variable dentrp de in texto.
}

// FUNCIÓN IMPORTANTE
// Que pasa con cada evento, donde se calculan y guardan las métricas.
async function processMessage(message, sensors) {
  const event = JSON.parse(message); // convierte el texto plano del mensaje en un objeto JSON para poder trabajar con él. 
  assertValidTrafficEvent(event); // valida que el evento tenga el formato correcto, si falta alvo o esta mal lanza un error y descarta el evento. 

  const previousRaw = await redis.hGet(KEYS.lastVehiclesPerMinute, event.entity_id); // lee un valor especifico en un Hash de Redis, en este caso el valor de vehículos por minuto del sensor que envió el evento.
  const previousVehiclesPerMinute = previousRaw === null ? Number.NaN : Number(previousRaw); // si previousRaw es null no había guardado por primera vez en ese sensor. Usa NaN para que la función de variación sepa que no hay un valor previo y no haga comparación.
                                                                                             // Si existia numero lo convierte de texto a numero con Number.
  const variation = calculateFlowVariation( // llama a la función que calcula la variación en los vehículos por minuto, le pasa el valor actual y el anterior.
    event.data.vehicles_per_minute,
    previousVehiclesPerMinute,
  );
  const alerts = evaluateAlerts(event); // Llama a la función de añertas, pasandole el evento completo.

  const sensorStates = await readCurrentSensorStates(sensors); // llama a una función que lee el estado actual de todos los sensores desde Redis.
  const networkMetrics = calculateNetworkMetrics(sensorStates); // Y luego calcula las metricas de red con eso. 
  const transaction = redis.multi(); // inicia una transacción, es decir un grupo de operaciones que se van a ejecutar todas juntas, de forma atomica (pasan todas o ninguna), esto evita que Redis quede en un estado a medias.

  transaction.hSet( // Guarda el valor actual de vehículos por minuto para que sea el anterior cuando llegue un evento a ese sensor. 
    KEYS.lastVehiclesPerMinute,
    event.entity_id,
    String(event.data.vehicles_per_minute), // lo convierte a texto porque Redis guarda todo como texto.
  );
  transaction.hSet(KEYS.sensorMetrics(event.entity_id), { // Guarda la variación calculada en un Hash específico de ese sendor, generando algo como traffic:metrics:TRAF-01
    entity_id: event.entity_id,
    variation_vpm: String(variation.absolute),
    variation_percent: String(variation.percentage),
    updated_at: event.timestamp,
  });
  transaction.zAdd(KEYS.occupancyRanking, [{ // Este es el ZADD del doc. Actualiza el Sorted Set (lista de nombres, con su numero) El sorted tiene el nombre de la intersección con su ocupación y con eso se have un ranking de mayor a menor ocupación.  
    score: event.data.occupancy,            // Cada vez que llega un evento nuevo de un sensor el ZADD actualiza o crea la posición de este sensor en el ranking con su ocupación actual como puntuación
    value: event.entity_id,
  }]);

  if (networkMetrics) { // puede devolver null si no hay sensores validos. El if evita que se guarde algo que no exista.
    transaction.hSet(KEYS.globalMetrics, {
      average_network_speed: String(networkMetrics.averageNetworkSpeed),
      total_vehicles_per_minute: String(networkMetrics.totalVehiclesPerMinute),
      average_occupancy: String(networkMetrics.averageOccupancy),
      busiest_sensor: networkMetrics.busiestSensor,
      busiest_occupancy: String(networkMetrics.busiestOccupancy),
      available_sensors: String(networkMetrics.availableSensors),
      updated_at: event.timestamp, // Guarda las metricas de red en el Hash traffic:metrics:global
    });
  }

  // Esta es la lógica de las alertas, si hay al menos una alerta la guarda con SET y se le pone un TTL o tiempo de vida.
  const alertKey = KEYS.sensorAlert(event.entity_id);
  if (alerts.length > 0) {
    transaction.set(alertKey, JSON.stringify({
      entity_id: event.entity_id,
      timestamp: event.timestamp,
      alerts,
    }), { EX: config.alertTtlSeconds }); // EX es "expire" en segundos
  } else {
    transaction.del(alertKey); // Si no hay ninguna alerta, borra la clave con (con DEL que es de Redis) (Si no cumple una condición puede borrarse rápido y no esperar al TTL) 
  }

  await transaction.exec(); // Aquí se ejecutan todas las operaciones que se fueron apilando arriba, todas juntas como una unidad. 

  const alertSummary = alerts.length > 0
    ? ` | ALERTAS: ${alerts.map((alert) => alert.type).join(', ')}`
    : '';
  console.log(
    `[processor] ${event.entity_id} variación=${variation.absolute} veh/min${alertSummary}`,
  );
} // Esto es solo un mensaje en consola que muestra que el sensor procesó su variación y si hubo alertas.


// Función para que retorne el estado actual de todos los sensores si tienen datos, listos para calcular las metricas de red.
async function readCurrentSensorStates(sensors) {
  const states = await Promise.all(sensors.map(async (sensor) => { // transforma cada sensor de la lista en una promesa (tendra un resultado en algún momento) que va a leer su estado actual en Redis
    const state = await redis.hGetAll(KEYS.sensorState(sensor.id)); // hGetAll trae todos los campos del Hash de ese sensor. Promise. all espera a que todas las lecturas (de los 6 sensores) terminen para leerlas en paralelo.
    if (Object.keys(state).length === 0) return null; // Si el hash está vacíp (el sensor nunca envío datos) devuelve null.

    return {
      entityId: sensor.id,
      averageSpeed: Number(state.average_speed),
      vehiclesPerMinute: Number(state.vehicles_per_minute),
      occupancy: Number(state.occupancy),
    };
  }));

  return states.filter(Boolean); // filtra el array para quitar los null y que solo queden valores verdaderos.
}

// Se llama cuando alguien apaga el programa 
async function shutdown(signal) {
  if (stopping) return; // para que solo se ejecute una vez.
  stopping = true;
  console.log(`[processor] Cerrando por ${signal}`);

  await processingQueue.catch(() => undefined); // Espera a que termine de procesar el evento que estaba a medias y luego cierra de forma ordenada las 2 conexiones a Redis, en vez de cerrarlas de golpe.
  await Promise.allSettled([
    subscriber.isOpen ? subscriber.quit() : undefined,
    redis.isOpen ? redis.quit() : undefined,
  ]);
}

for (const signal of ['SIGINT', 'SIGTERM']) { // la primera es la señal que manda el control C para ceerrar, la segunda es la que usa Docker para pedirle al programa que se cierre bien y ordenado.
  process.on(signal, () => { // quien sea que mande alguna de estas dos señales, ejecute shutdown primero y luego cierre el programa.
    shutdown(signal).finally(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error('[processor] No pudo iniciar:', error);
  process.exitCode = 1;
}); // Esto es lo que de verdad arranca todo el programa, llama a main (). Si algo falla al iniciar lo captura y marca que el programa termino con error.
