# Smart Traffic Redis — Blueprint

> Generado el 2026-09-20  
> Arquetipo principal: herramienta interna / dashboard académico en tiempo real

## 1. Visión y alcance

Sistema distribuido académico para simular seis sensores de tráfico ubicados en Sogamoso, publicar sus eventos, procesarlos con Redis y visualizarlos en Grafana. Debe demostrar en vivo comunicación inmediata, estado actual, histórico reciente, métricas derivadas, alertas y actualización automática.

### Objetivos verificables

- Generar seis eventos coherentes cada 10 segundos, uno por sensor.
- Transportar cada evento completo por Redis Pub/Sub.
- Mantener estado actual en Hashes e histórico reciente en un Stream limitado.
- Calcular velocidad promedio, variación de flujo y ranking de ocupación.
- Mostrar KPIs, mapa, dos series temporales y alertas sin recargar manualmente.
- Arrancar todo el sistema de forma reproducible con Docker Compose.

### Fuera de alcance

- API pública de tráfico.
- Autenticación.
- Persistencia histórica de largo plazo.
- Despliegue público.
- Consumer Groups en la primera versión.

## 2. Stack

| Capa | Tecnología | Motivo |
|---|---|---|
| Aplicaciones | Node.js 22 + JavaScript ESM | Un lenguaje, APIs modernas y disponible en el equipo |
| Cliente Redis | `redis` | Cliente oficial con Pub/Sub, Streams, Hashes y transacciones |
| Base y eventos | Redis 7 | Tecnología obligatoria y suficiente para el ejercicio |
| Dashboard | Grafana OSS | KPIs, Geomap, Time Series y actualización automática sin frontend propio |
| Integración | Redis Data Source 2.2.0 | Consulta Hashes, Streams y Sorted Sets desde Grafana |
| Pruebas | `node:test` | Incluido en Node.js, sin framework adicional |
| Ejecución | Docker Compose | Inicio repetible para desarrollo y exposición |

## 3. Arquitectura

```text
config/sensors.json
        ↓
Simulator module
        ↓
Publisher ── HSET / XADD / PUBLISH ──> Redis
                                         │
                                         ↓ Pub/Sub
                                    Processor
                                         │
                          HSET / ZADD / SET EX / DEL
                                         │
                                         ↓
                          Grafana + Redis Data Source
```

El simulador y el Publisher son módulos separados dentro del mismo proceso. El Processor usa una conexión exclusiva para suscribirse. Grafana consulta Redis y no sustituye al Subscriber.

## 4. Estructura

```text
config/sensors.json                    # Seis puntos simulados fijos
src/shared/config.js                   # Variables de entorno
src/shared/keys.js                     # Claves y canales Redis
src/shared/traffic-event.js            # Normalización y validación
src/simulator/traffic-simulator.js     # Estado y escenarios
src/publisher/index.js                 # Publicación transaccional
src/processor/metrics.js               # Fórmulas puras
src/processor/index.js                 # Subscriber y persistencia derivada
src/tools/set-scenario.js              # Fuerza escenarios para la demo
grafana/provisioning/                  # Data source y dashboard como código
grafana/dashboards/                    # Dashboard versionado
test/                                  # Pruebas unitarias
docs/                                  # Fuente de verdad y decisiones
```

## 5. Modelo de datos

### Evento de tráfico

Campos obligatorios: `event_id`, `entity_id`, `timestamp`, `source`, `location` y `data`. Las mediciones son `vehicles_per_minute`, `average_speed`, `occupancy`, `average_travel_time` y `congestion`.

### Redis

| Clave/canal | Tipo | Contenido | Retención |
|---|---|---|---|
| `traffic-events` | Pub/Sub | JSON completo | No retiene |
| `traffic-control` | Pub/Sub | Orden de escenario para la demo | No retiene |
| `sensor:traffic:<id>` | Hash | Último estado plano | Sin TTL |
| `traffic:stream` | Stream | Eventos planos | `MAXLEN ~360` |
| `traffic:metrics:global` | Hash | KPIs actuales | Sin TTL |
| `traffic:metrics:sensor:<id>` | Hash | Variación individual | Sin TTL |
| `traffic:metrics:last-vpm` | Hash | Valor anterior por sensor | Sin TTL |
| `traffic:ranking:occupancy` | Sorted Set | Sensor → ocupación | Se sobrescribe |
| `traffic:alert:<id>` | String JSON | Alertas activas | TTL 60 s |

## 6. Integridad y procesamiento

- El Publisher valida el evento antes de tocar Redis.
- `HSET`, `XADD` y `PUBLISH` se ejecutan mediante `MULTI/EXEC`, publicando al final.
- El Processor serializa localmente su cola para evitar carreras entre eventos.
- Las alertas se renuevan mientras persisten y se eliminan al recuperarse.
- El Stream limita su crecimiento y el estado actual no expira mientras el sensor exista.

## 7. Dashboard

Una sola ruta web, servida por Grafana en `http://localhost:3000`, con:

- velocidad media, flujo total y ocupación media;
- sensor más ocupado;
- Geomap con seis sensores;
- velocidad contra tiempo;
- vehículos por minuto contra tiempo;
- ranking de ocupación;
- estado de alertas activas.

La actualización será automática. La apariencia usará fondo oscuro de Grafana y semántica consistente: verde `LOW`, amarillo `MEDIUM`, rojo `HIGH`.

## 8. Seguridad

Es un entorno académico local. Grafana usa credenciales configurables por variables de entorno. Redis solo se expone en localhost durante desarrollo y no se publican secretos. `.env` queda ignorado; `.env.example` sí se versiona.

## 9. Orden de construcción

1. Contrato, sensores, claves y configuración.
2. Simulador y pruebas de coherencia.
3. Publisher y escritura transaccional.
4. Processor, métricas y alertas.
5. Docker Compose con Redis y Grafana.
6. Prueba vertical Redis → Grafana.
7. Dashboard completo.
8. Pruebas de integración y reconexión.
9. Documentación de ejecución y guion de exposición.

## 10. Entorno

Requisitos: Docker Desktop o Node.js 22 + Redis. Inicio recomendado:

```bash
copy .env.example .env
docker compose up --build
```

Variables principales: `REDIS_URL`, `SIMULATION_INTERVAL_MS`, `STREAM_MAX_LENGTH`, `ALERT_TTL_SECONDS`, `SCENARIO_CYCLES`, `GRAFANA_ADMIN_USER` y `GRAFANA_ADMIN_PASSWORD`.

## 11. Dependencias

| Paquete | Tipo | Uso |
|---|---|---|
| `redis` | Producción | Conexión y comandos Redis |

No se requieren dependencias de desarrollo: las pruebas usan herramientas de Node.js.

## 12. Pruebas

- Unitarias: límites, transiciones, cálculo de tiempo, validación, métricas y alertas.
- Integración: flujo Publisher → Redis → Processor con Redis real.
- Manual/E2E: forzar congestión y comprobar Hash, Stream, alerta y dashboard.

## 13. Reglas no negociables

1. El simulador nunca genera cada campo de forma independiente desde cero.
2. Todos los eventos pasan por el mismo normalizador y validador.
3. Pub/Sub transporta JSON completo; el Stream guarda campos planos.
4. No introducir Socket.IO ni una API web salvo que Grafana resulte inviable.
5. No cambiar nombres de claves sin actualizar documentación, pruebas y dashboard.
6. Ningún secreto real se versiona.
7. La demostración debe funcionar sin Internet después de descargar imágenes y plugin.

## 14. Guía para agentes de código

El archivo `AGENTS.md` del repositorio contiene los comandos, flujo de datos y reglas que deben seguir quienes continúen la implementación.
