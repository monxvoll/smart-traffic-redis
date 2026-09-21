# Smart Traffic Redis

Sistema académico de monitoreo de tráfico simulado en tiempo real con Node.js, Redis y Grafana.

## Comandos

- `npm test` — Ejecuta todas las pruebas unitarias.
- `npm run start:publisher` — Inicia simulador y Publisher.
- `npm run start:processor` — Inicia Subscriber/Processor.
- `npm run scenario -- CONGESTED TRAF-03 6` — Fuerza un escenario para la demostración.
- `docker compose up --build` — Inicia el sistema completo.
- `docker compose down` — Detiene los contenedores sin borrar datos.

## Arquitectura

- `config/` contiene los seis sensores simulados fijos.
- `src/simulator/` genera mediciones con continuidad temporal.
- `src/publisher/` normaliza, valida y escribe estado, histórico y Pub/Sub.
- `src/processor/` consume Pub/Sub y calcula métricas y alertas.
- `src/shared/` define contratos, configuración y claves Redis compartidas.
- `grafana/` contiene data source y dashboard aprovisionados.
- `docs/` conserva requisitos y decisiones del equipo.

## Flujo

`Simulator → Publisher → Redis Pub/Sub + Hash + Stream → Processor → Redis metrics/alerts → Grafana`.

## Reglas

1. Mantener JavaScript ESM y Node.js 22.
2. Usar el cliente oficial `redis`; no añadir `ioredis`.
3. No añadir Socket.IO ni frontend propio mientras Grafana cubra el requisito.
4. Pub/Sub publica el evento JSON completo; Streams y Hashes usan campos planos.
5. Centralizar claves y canales en `src/shared/keys.js`.
6. Todo cambio de fórmula debe actualizar pruebas y documentación.
7. No romper los rangos del contrato ni generar saltos abruptos.
8. No versionar `.env`, credenciales ni datos locales de Grafana/Redis.
9. Preferir funciones pequeñas y herramientas incluidas en Node.js.
10. Ejecutar `npm test` antes de integrar cambios.
