# Smart Traffic Redis — Grupo 1

Sistema academico de monitoreo de trafico en tiempo real mediante seis sensores simulados en Sogamoso. El proyecto genera eventos coherentes, los comunica y almacena temporalmente con Redis, calcula metricas y alertas, y los presenta en un dashboard de Grafana.

## Arquitectura

```text
Simulador -> Publisher -> Redis Pub/Sub -> Processor
                         |                 |
                         |                 +-> metricas, ranking y alertas
                         +-> Hashes (estado actual)
                         +-> Stream (historico reciente)
                                      |
                                      v
                                  Grafana
```

El simulador forma parte del proceso Publisher, pero esta separado en un modulo propio. De esta manera se puede sustituir por una API real sin modificar Redis, el Processor ni el dashboard.

## Componentes

- **Simulador:** genera un evento por sensor cada 10 segundos y evoluciona gradualmente por los escenarios `LOW`, `MEDIUM`, `HIGH`, `CONGESTED` y `RECOVERY`.
- **Publisher:** normaliza cada lectura al contrato JSON y ejecuta `HSET`, `XADD` y `PUBLISH`.
- **Redis:** comunica eventos, conserva el estado actual y mantiene un historico reciente limitado.
- **Processor:** consume `traffic-events`, calcula metricas, actualiza el ranking y crea alertas temporales.
- **Grafana:** consulta Redis directamente mediante Redis Data Source. No se necesita Socket.IO ni un servidor web intermedio.

## Estructuras de Redis

| Necesidad | Mecanismo o estructura | Clave/canal |
|---|---|---|
| Entrega inmediata | Pub/Sub | `traffic-events` |
| Control de la simulacion | Pub/Sub | `traffic-control` |
| Estado actual | Hash | `sensor:traffic:<ID>` |
| Historico reciente | Stream | `traffic:stream` |
| Metricas generales | Hash | `traffic:metrics:global` |
| Metricas por sensor | Hash | `traffic:metrics:sensor:<ID>` |
| Ranking de ocupacion | Sorted Set | `traffic:ranking:occupancy` |
| Alertas temporales | String JSON + TTL | `traffic:alert:<ID>` |

Pub/Sub permite baja latencia, pero no conserva mensajes para un consumidor desconectado. El Stream conserva aproximadamente los ultimos 360 eventos para que puedan consultarse despues. Los Hashes representan la ultima fotografia de cada sensor y el Sorted Set permite ordenar sensores por ocupacion sin recorrerlos todos.

## Requisitos

- Docker Desktop con Docker Compose.
- Node.js 22 o superior solo si se desean ejecutar pruebas o herramientas fuera de Docker.

## Inicio rapido

Desde la raiz del repositorio:

```powershell
docker compose up -d --build
```

Espere unos 20 segundos y abra:

- Dashboard: http://localhost:3000/d/smart-traffic-sogamoso
- Grafana: http://localhost:3000

El acceso anonimo de solo lectura esta habilitado para facilitar la demostracion local. Las credenciales administrativas predeterminadas son `admin` / `admin`; pueden cambiarse copiando `.env.example` como `.env`. Esta configuracion no debe usarse en un despliegue publico.

Para revisar el funcionamiento:

```powershell
docker compose ps
docker compose logs -f publisher processor
docker compose exec -T publisher npm run verify
```

## Generar una condicion especial

El comando siguiente obliga al sensor `TRAF-03` a permanecer dos ciclos en congestion. El Publisher recibe la orden por el canal `traffic-control`; no se reinicia ningun componente.

```powershell
docker compose exec -T publisher npm run scenario -- CONGESTED TRAF-03 2
```

Tambien se puede aplicar el escenario a todos los sensores omitiendo el identificador:

```powershell
docker compose exec -T publisher npm run scenario -- RECOVERY
```

## Pruebas

```powershell
npm install
npm test
npm run check
```

Las pruebas unitarias validan el contrato de eventos, los limites del simulador, la progresion sin saltos abruptos, las metricas derivadas y las reglas de alerta.

## Consultas utiles en Redis

```powershell
docker compose exec redis redis-cli HGETALL sensor:traffic:TRAF-01
docker compose exec redis redis-cli XLEN traffic:stream
docker compose exec redis redis-cli XREVRANGE traffic:stream + - COUNT 2
docker compose exec redis redis-cli HGETALL traffic:metrics:global
docker compose exec redis redis-cli ZREVRANGE traffic:ranking:occupancy 0 -1 WITHSCORES
docker compose exec redis redis-cli GET traffic:alert:TRAF-03
docker compose exec redis redis-cli TTL traffic:alert:TRAF-03
```

## Detener el entorno

```powershell
docker compose down
```

Redis usa AOF y un volumen de Docker, por lo que los datos sobreviven a un reinicio normal de los contenedores. `docker compose down -v` elimina los volumenes y, por tanto, borra el historico y la configuracion local de Grafana.

## Organizacion del repositorio

```text
config/                     Configuracion de los seis sensores
src/simulator/              Modelo y escenarios de trafico
src/publisher/              Publicador y escritura en Redis
src/processor/              Suscriptor, metricas y alertas
src/shared/                 Contratos, claves y configuracion compartida
src/tools/                  Control de escenarios y verificacion
grafana/                    Dashboard y aprovisionamiento
test/                       Pruebas unitarias
docs/                       Contexto, decisiones y guia de demostracion
output/                     Plano tecnico confirmado
```

La fuente de verdad funcional y academica esta en [docs/CONTEXTO_PROYECTO.md](docs/CONTEXTO_PROYECTO.md). La revision razonada de la arquitectura esta en [docs/REVISION_DECISIONES_ARQUITECTURA.md](docs/REVISION_DECISIONES_ARQUITECTURA.md).

La distribucion de responsabilidades y las instrucciones para cada integrante estan en [docs/Guia_de_trabajo_equipo_Grupo_1.docx](docs/Guia_de_trabajo_equipo_Grupo_1.docx).

## Alcance de los datos

Las ubicaciones de `config/sensors.json` son puntos aproximados creados para la simulacion academica; no representan sensores fisicos reales. Redis conserva el estado operativo y el historico corto. En un sistema productivo, historicos de meses, auditoria y analitica se enviarian a una base persistente externa.
