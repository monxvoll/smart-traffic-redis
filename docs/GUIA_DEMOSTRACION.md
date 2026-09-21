# Guia de demostracion en vivo

Duracion sugerida: 6 a 8 minutos.

## Preparacion

1. Ejecutar `docker compose up -d --build`.
2. Esperar aproximadamente 20 segundos.
3. Ejecutar `docker compose exec -T publisher npm run verify`.
4. Abrir `http://localhost:3000/d/smart-traffic-sogamoso`.
5. Abrir otra terminal para los comandos de Redis y de escenarios.

## Recorrido recomendado

1. **Fuente y Publisher:** mostrar los logs con `docker compose logs -f publisher` y explicar que en cada ciclo se producen seis eventos normalizados.
2. **Estado actual:** ejecutar `docker compose exec redis redis-cli HGETALL sensor:traffic:TRAF-01`.
3. **Historico reciente:** ejecutar `docker compose exec redis redis-cli XREVRANGE traffic:stream + - COUNT 2`.
4. **Procesamiento:** mostrar `docker compose logs --tail 20 processor` y `HGETALL traffic:metrics:global`.
5. **Tiempo real:** mantener visible el dashboard hasta observar la siguiente actualizacion de 10 segundos.
6. **Alerta controlada:** ejecutar `docker compose exec -T publisher npm run scenario -- CONGESTED TRAF-03 2`.
7. **Resultado:** mostrar la alerta en el dashboard y consultar `GET traffic:alert:TRAF-03` junto con `TTL traffic:alert:TRAF-03`.
8. **Recuperacion:** ejecutar `docker compose exec -T publisher npm run scenario -- RECOVERY TRAF-03 2` y observar la normalizacion gradual.

## Explicacion corta por componente

- El **simulador** produce lecturas relacionadas entre si, no numeros independientes.
- El **Publisher** convierte cualquier fuente al mismo contrato y publica el evento solo despues de guardar su estado e historico.
- **Pub/Sub** entrega el evento inmediatamente. Si el Processor esta desconectado, ese mensaje particular se pierde.
- El **Stream** conserva una copia reciente; por eso un proceso puede consultar eventos anteriores.
- El **Processor** calcula velocidad media de la red, flujo total, ocupacion media y variacion por sensor. Tambien mantiene el ranking y evalua alertas.
- **Grafana** consulta las estructuras derivadas en Redis y refresca cada cinco segundos.

## Respuestas esenciales para la sustentacion

**¿Por que Redis?** Porque el problema requiere lectura y escritura rapidas, comunicacion de eventos y estructuras adecuadas para estado, ventanas recientes y rankings.

**¿Que pasa si se desconecta el Subscriber?** Pierde mensajes de Pub/Sub durante la desconexion. Los eventos permanecen en el Stream y permiten una recuperacion posterior; la version base demuestra la diferencia, aunque no implementa reprocesamiento automatico con Consumer Groups.

**¿Que pasa al reiniciar Redis?** AOF y el volumen de Docker recuperan los datos confirmados. Puede perderse una pequena fraccion segun la politica de sincronizacion. Pub/Sub nunca es persistente.

**¿Como se controla el crecimiento?** El Stream usa `MAXLEN ~ 360`; las alertas expiran a los 60 segundos; Hashes y Sorted Sets sobrescriben valores por sensor y, por tanto, tienen cardinalidad acotada.

**¿Cual es la latencia aproximada?** El transporte y procesamiento suele tardar milisegundos; la visualizacion puede tardar hasta cinco segundos adicionales por el refresco de Grafana. El intervalo de 10 segundos representa la frecuencia de medicion, no la latencia de procesamiento.

**¿Como escalaria?** Se podrian ejecutar varios Publishers y usar Redis Streams con Consumer Groups para distribuir el procesamiento entre varios Processors sin duplicar trabajo. Redis Cluster o un servicio administrado permitiria escalar y aumentar disponibilidad.
