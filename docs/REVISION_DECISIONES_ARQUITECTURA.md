# Revisión de decisiones y propuesta de arquitectura

> Estado: **propuesta para confirmación del grupo**. Este documento evalúa las decisiones existentes y corrige ambigüedades antes de iniciar la implementación. No reemplaza los requisitos del profesor documentados en `CONTEXTO_PROYECTO.md`.

## 1. Dictamen general

La dirección elegida es adecuada para el taller: simulación controlada, Node.js, Redis con Pub/Sub + Hashes + Streams + Sorted Sets y Grafana como aplicación web. Cumple el objetivo académico, permite una demostración reproducible y evita depender de credenciales o disponibilidad de terceros.

Se recomienda conservar la idea con los siguientes ajustes obligatorios antes de programar:

1. Usar seis ubicaciones **fijas** de Sogamoso, no coordenadas aleatorias en cada ejecución.
2. Definir el simulador como un módulo consumido por el Publisher, no como otro servicio que necesite un protocolo adicional.
3. Guardar campos planos y numéricos en el Stream para que Grafana pueda graficarlos; Pub/Sub sí transportará el JSON completo.
4. Corregir la retención: 100 eventos no representan 16 minutos si los seis sensores emiten cada 10 segundos.
5. Definir fórmulas exactas para métricas, congestión, tiempo de desplazamiento y alertas.
6. Validar Grafana + Redis Data Source con una prueba vertical pequeña antes de construir todo el dashboard.
7. Documentar que se elimina Socket.IO **porque Grafana consulta Redis directamente**, no porque los datos sean simulados.

## 2. Revisión decisión por decisión

| Decisión | Dictamen | Ajuste o justificación |
|---|---|---|
| Utilizar solo simulador | **Aprobar** | La guía lo permite y el proyecto será demostrable sin cuentas, pagos ni APIs externas. Debe mantenerse una interfaz de fuente para que el Publisher no dependa de los detalles del simulador. |
| Seis sensores | **Aprobar** | Es suficiente para que el mapa, los rankings y las comparaciones sean interesantes sin saturar la demostración. |
| Sensores aleatorios o en Sogamoso | **Cambiar a ubicaciones fijas en Sogamoso** | Las coordenadas aleatorias dificultan repetir pruebas y pueden situar sensores fuera de vías. Una configuración fija es más realista y reproducible. |
| Emitir cada 10 segundos | **Aprobar con precisión** | Cada ciclo debe generar **un evento por cada uno de los seis sensores**; por tanto se producen 6 eventos cada 10 s, equivalentes a 36 eventos/minuto. |
| Node.js + librería `redis` | **Aprobar** | Permite usar el mismo lenguaje en simulador, Publisher y Processor. Se usará el cliente oficial `redis` y módulos ES. |
| Pub/Sub + Hash + Stream + Sorted Set | **Aprobar** | Cada mecanismo tiene una responsabilidad fácil de explicar y demuestra un uso sustancial de Redis. |
| `traffic:stream MAXLEN ~100` | **Cambiar** | Con 6 eventos cada 10 s, 100 eventos cubren solo unos 2.8 minutos. Para unos 10 minutos se recomiendan aproximadamente 360 eventos; se propone `MAXLEN ~ 360`. |
| Grafana en lugar de frontend propio | **Aprobar con prueba temprana** | Reduce código y Grafana es una aplicación web válida para KPIs, series y mapa. El plugin de Redis soporta HGETALL, XRANGE y ZRANGE, pero debe comprobarse la forma exacta de los datos y las transformaciones del Geomap. |
| Eliminar Socket.IO | **Aprobar por la razón correcta** | Una fuente simulada no elimina la necesidad de comunicación web. Socket.IO deja de ser necesario porque Grafana y el plugin Redis Data Source consultan/actualizan directamente los paneles. |
| TTL de 60 s para alertas activas | **Aprobar con eliminación explícita** | Mientras una alerta continúe activa se renueva el TTL; cuando la condición se recupere, el Processor debe eliminarla inmediatamente para no mostrar una alerta falsa durante 60 s. |
| No usar persistencia externa | **Aprobar** | El histórico de largo plazo no es requisito. En un sistema real se enviaría a una base de datos analítica o almacenamiento permanente. |

## 3. Arquitectura propuesta

```text
config/sensors.json
        │
        ▼
Simulador (módulo Node.js con estado por sensor)
        │ medición cruda
        ▼
Publisher (normaliza + valida)
        │
        ├── HSET sensor:traffic:<id>          estado actual
        ├── XADD traffic:stream MAXLEN ~360   histórico reciente
        └── PUBLISH traffic-events            comunicación inmediata
                    │
                    ▼
Processor / Subscriber
        ├── métricas globales y por sensor
        ├── ZADD traffic:ranking:occupancy
        └── SET traffic:alert:<id> EX 60
                    │
                    ▼
Grafana + Redis Data Source
        ├── HGETALL / HMGET   estado, mapa y KPIs
        ├── XRANGE            gráficas temporales
        ├── ZRANGE            ranking
        └── GET               alertas activas
```

Grafana no será el Subscriber de Pub/Sub. El Processor cumple esa responsabilidad. Grafana consulta las estructuras que Publisher y Processor mantienen en Redis.

### Flujo atómico recomendado del Publisher

Por cada evento, el Publisher ejecutará una transacción Redis en este orden:

1. `HSET` del estado actual.
2. `XADD ... MAXLEN ~ 360` del histórico.
3. `PUBLISH` del JSON completo.

Publicar al final evita que el Processor reciba la notificación antes de que el estado y el histórico estén disponibles.

## 4. Stack recomendado

| Capa | Tecnología | Razón |
|---|---|---|
| Simulador, Publisher y Processor | Node.js 22, JavaScript con módulos ES | Ya está disponible en el equipo y mantiene un único lenguaje. |
| Cliente Redis | `redis` para npm | Cliente oficial, suficiente para Pub/Sub, Hashes, Streams, transacciones y Sorted Sets. |
| Validación y pruebas | Funciones pequeñas + `node:test` | Evita frameworks adicionales y deja verificaciones ejecutables de rangos, transiciones y fórmulas. |
| Base en memoria | Redis | Tecnología central y obligatoria del taller. |
| Visualización | Grafana OSS + Redis Data Source | Reemplaza el frontend y servidor Socket.IO hechos a mano. |
| Mapa | Panel Geomap de Grafana | Permite representar latitud, longitud y congestión. |
| Ejecución | Docker Compose | Redis, Grafana, Publisher y Processor arrancan de forma reproducible para la demostración. |

## 5. Contrato de evento recomendado

```json
{
  "event_id": "uuid",
  "entity_id": "TRAF-01",
  "timestamp": "2026-09-19T10:30:00.000Z",
  "source": "SIMULATOR",
  "location": {
    "latitude": 5.72,
    "longitude": -72.93
  },
  "data": {
    "vehicles_per_minute": 48,
    "average_speed": 22.4,
    "occupancy": 81.2,
    "average_travel_time": 7.8,
    "congestion": "HIGH"
  }
}
```

`event_id` se puede generar con `crypto.randomUUID()` de Node.js y facilita rastrear el mismo evento en logs, Redis y la demostración. `source` conserva el desacoplamiento conceptual aunque la primera versión solo use el simulador.

### Representación en Redis

- **Pub/Sub:** JSON completo serializado.
- **Hash de estado:** campos planos como `average_speed`, `occupancy`, `latitude` y `longitude`.
- **Stream:** campos planos, no un único campo que contenga todo el JSON. Esto permite a Grafana reconocer las columnas numéricas al ejecutar `XRANGE`.

## 6. Modelo realista del simulador

Cada sensor conserva su estado anterior y un escenario interno:

```text
LOW → MEDIUM → HIGH → CONGESTED → RECOVERY → MEDIUM/LOW
```

El siguiente valor se obtiene aplicando variaciones pequeñas al anterior y acercándolo gradualmente al rango objetivo del escenario. No se sortea cada medición desde cero.

### Rangos globales válidos

| Campo | Unidad | Rango |
|---|---|---:|
| `vehicles_per_minute` | vehículos/min | 0–100 |
| `average_speed` | km/h | 0–60 |
| `occupancy` | % | 0–100 |
| `average_travel_time` | min | 1–15 |
| `congestion` | categoría | `LOW`, `MEDIUM`, `HIGH` |

Estos son límites de validación, no rangos de generación uniforme.

### Reglas de coherencia

- El flujo, la ocupación y la velocidad cambian como máximo una cantidad acotada por ciclo.
- Al aumentar la ocupación, la velocidad objetivo disminuye.
- `congestion` se **deriva** de ocupación y velocidad; no se genera al azar.
- `average_travel_time` se **deriva** de la longitud fija del segmento, la velocidad y una penalización por ocupación.
- La división por velocidad debe protegerse usando una velocidad efectiva mínima y el resultado final se limita a 1–15 minutos.

Fórmula explicable sugerida:

```text
base_minutes = (segment_length_km / max(average_speed, 5)) × 60
average_travel_time = clamp(base_minutes × (1 + occupancy / 200), 1, 15)
```

La longitud del tramo será una propiedad estática de cada sensor en `config/sensors.json`.

## 7. Métricas derivadas definitivas propuestas

### 7.1 Velocidad promedio actual de la red

```text
average_network_speed = suma de velocidades actuales / sensores disponibles
```

Se calcula usando el último estado conocido de los seis sensores y se guarda en:

```text
traffic:metrics:global (Hash)
```

### 7.2 Variación de flujo por sensor

```text
variation_vpm = current_vpm - previous_vpm
variation_percent = previous_vpm == 0
  ? 0
  : ((current_vpm - previous_vpm) / previous_vpm) × 100
```

El Processor conservará el valor anterior por sensor en:

```text
traffic:metrics:last-vpm (Hash)
```

### 7.3 Ranking de ocupación

```text
ZADD traffic:ranking:occupancy <occupancy> <entity_id>
```

El sensor con mayor puntuación representa la intersección más ocupada. No requiere TTL porque cada evento reemplaza la puntuación del sensor.

## 8. Reglas de alerta propuestas

| Alerta | Condición | Recuperación |
|---|---|---|
| Congestión alta | `occupancy > 90` | `occupancy <= 90` |
| Velocidad crítica | `average_speed < 10` km/h | `average_speed >= 10` km/h |

Para mantener el dashboard simple, cada sensor tendrá una clave fija:

```text
traffic:alert:TRAF-01
```

El valor será un JSON con los tipos de alerta activos, valores observados y timestamp. Si existe al menos una alerta, se guarda con `SET ... EX 60`; en cada evento que mantenga la condición se renueva el TTL. Cuando ninguna condición se cumple, se ejecuta `DEL` inmediatamente.

## 9. Retención correcta

Si los seis sensores emiten cada 10 segundos:

```text
6 eventos/ciclo × 6 ciclos/minuto = 36 eventos/minuto
```

Por tanto:

| Límite aproximado | Cobertura |
|---:|---:|
| 100 eventos | 2.8 minutos |
| 360 eventos | 10 minutos |
| 540 eventos | 15 minutos |

Se propone `MAXLEN ~ 360`: ofrece suficiente historia para dos gráficas durante la exposición y mantiene el conjunto pequeño.

## 10. Dashboard de Grafana

Paneles mínimos propuestos:

1. **Stat:** velocidad promedio actual de la red.
2. **Stat:** vehículos por minuto totales o promedio actual.
3. **Stat:** sensor con mayor ocupación.
4. **Geomap:** seis sensores fijos, coloreados por congestión.
5. **Time Series:** velocidad promedio por sensor contra tiempo.
6. **Time Series:** vehículos por minuto por sensor contra tiempo.
7. **Bar gauge o tabla:** ranking actual de ocupación.
8. **Tabla/estado:** alertas activas.

El plugin Redis Data Source declara soporte para `HGETALL`, `HMGET`, `XRANGE`, `XREVRANGE` y `ZRANGE`, además de actualización en modo streaming. Aun así, su versión publicada en el marketplace es antigua, por lo que la primera integración debe ser una prueba vertical con un Hash, un Stream de muestra y un panel Geomap antes de dar por terminada esta elección.

Referencias verificadas:

- [Redis Data Source en Grafana Marketplace](https://grafana.com/grafana/plugins/redis-datasource/)
- [Comandos Redis soportados](https://redisgrafana.github.io/redis-datasource/commands/)
- [Consulta XRANGE y compatibilidad con visualizaciones](https://redisgrafana.github.io/redis-datasource/redis/XRANGE/)
- [Modo de actualización streaming](https://redisgrafana.github.io/redis-datasource/streaming/)

## 11. Reparto de responsabilidades ajustado

### Persona 1 — Base común + simulador

- Crear la estructura inicial del repositorio, scripts y Docker Compose.
- Definir `config/sensors.json`, contrato del evento, claves Redis compartidas y validaciones.
- Implementar el simulador con estado por sensor, escenarios y transiciones graduales.
- Crear pruebas de rangos, coherencia y recuperación.

### Persona 2 — Publisher

- Consumir el módulo del simulador.
- Normalizar y validar cada medición.
- Escribir Hash y Stream y luego publicar el JSON mediante una transacción Redis.
- Incorporar logs que permitan seguir un `event_id` durante la demostración.

### Persona 3 — Processor/Subscriber

- Usar una conexión Redis dedicada para Pub/Sub.
- Calcular las tres métricas definidas.
- Actualizar el Hash global, Hash de valores anteriores y Sorted Set.
- Crear, renovar y eliminar las alertas activas.
- Verificar el comportamiento cuando se desconecta y reconecta.

### Persona 4 — Grafana

- Aprovisionar automáticamente el plugin, data source y dashboard.
- Validar primero Hash, Stream y Geomap con datos pequeños.
- Crear KPIs, mapa, dos series temporales, ranking y alertas.
- Configurar actualización automática y documentar la latencia observada.

### Responsabilidad compartida

- Cada integrante debe revisar al menos un componente ajeno.
- Los cuatro deben ejecutar el sistema completo y preparar las respuestas de defensa técnica.
- La integración final no debe dejarse únicamente a la Persona 1.

## 12. Estructura de repositorio propuesta

```text
smart-traffic-redis/
├── config/
│   └── sensors.json
├── src/
│   ├── shared/
│   ├── simulator/
│   ├── publisher/
│   └── processor/
├── grafana/
│   ├── dashboards/
│   └── provisioning/
├── test/
├── docs/
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

Un solo proyecto Node.js y un solo `package.json` son suficientes. La separación por carpetas hace visibles las responsabilidades sin introducir cuatro repositorios ni varios sistemas de dependencias.

## 13. Orden de construcción

1. Contrato de evento, configuración de sensores y nombres de claves.
2. Docker Compose con Redis y Grafana; prueba de conexión del plugin.
3. Simulador con pruebas deterministas.
4. Publisher y verificación manual de Hash, Stream y Pub/Sub.
5. Processor, métricas y alertas.
6. Prueba vertical de un panel por tipo de estructura.
7. Dashboard completo.
8. Pruebas de integración, guion de demostración y documentación.

## 14. Decisión sobre Ponytail

No se recomienda instalar Ponytail como dependencia de trabajo en esta etapa. Su principio de evitar sobreingeniería es valioso, pero el proyecto ya puede mantenerse simple con esta arquitectura y la habilidad puede intentar reducir elementos que aquí son requisitos académicos explícitos, como la separación Publisher/Processor, el uso de varias estructuras Redis o la documentación extensa.

Podría utilizarse después únicamente como revisión de complejidad del código. Para construir la base se aplicarán directamente estos principios:

- un solo lenguaje;
- un solo `package.json`;
- pocas dependencias;
- funciones pequeñas;
- sin abstracciones especulativas;
- pruebas con herramientas incluidas en Node.js.

## 15. Riesgos pendientes antes de confirmar

1. Compatibilidad práctica del plugin Redis Data Source con la versión de Grafana que se fije en Docker.
2. Transformaciones necesarias para que Geomap combine los seis Hashes.
3. Coordenadas y longitudes de tramo definitivas de los seis sensores de Sogamoso.
4. Forma de forzar un escenario de congestión durante la demostración sin depender del azar.
