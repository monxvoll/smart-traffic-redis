# Contexto y requisitos — Sistema de tráfico inteligente con Redis

> Fuente de verdad inicial del Grupo 1. Este documento organiza los requisitos entregados por el profesor y los separa de las decisiones de diseño del equipo. Las decisiones del grupo se incorporarán después de validarlas.

## 1. Identidad del proyecto

- **Curso:** Tendencias Modernas de Bases de Datos.
- **Actividad:** Sistemas de datos en tiempo real con Redis.
- **Grupo:** Grupo 1.
- **Contexto asignado:** tráfico inteligente.
- **Problema:** monitoreo de tráfico mediante múltiples sensores distribuidos que representan intersecciones, vías o puntos de observación.
- **Tipo de proyecto:** prototipo académico distribuido con demostración en vivo.
- **Equipo:** cuatro integrantes; todos deben comprender y poder explicar la arquitectura completa.

## 2. Propósito

Diseñar e implementar un sistema que reciba continuamente datos de tráfico, los normalice, los comunique mediante eventos, los procese, mantenga en Redis tanto el estado actual como un histórico reciente y los muestre en un dashboard que se actualice automáticamente.

El propósito pedagógico central no es solo guardar datos en Redis. Redis debe participar de forma relevante en:

1. La comunicación inmediata de eventos.
2. El almacenamiento rápido del estado actual.
3. La conservación temporal del histórico reciente.
4. El cálculo o consulta de métricas derivadas.

## 3. Arquitectura conceptual obligatoria

```text
API real ─────┐
              ├─> Publisher ─> Redis ─> Subscriber/Processor ─> Aplicación web ─> Dashboard
Simulador ────┘
```

Debe existir una separación conceptual clara entre:

- fuente de datos;
- Publisher;
- Redis;
- Subscriber/Processor;
- aplicación web;
- visualización.

No es obligatorio que cada bloque sea una aplicación independiente. El Publisher debe desacoplar al resto del sistema de la fuente seleccionada y producir el mismo contrato de evento tanto en modo real como en modo simulado.

## 4. Requisitos clasificados

### 4.1 Obligatorios

- Redis funcionando correctamente.
- Generación continua y periódica de datos.
- Modo de simulación disponible siempre, incluso si se integra una API real.
- Publisher que capture, normalice y publique los eventos.
- Subscriber o Processor que consuma y procese los eventos.
- Comunicación mediante **Redis Pub/Sub**.
- Uso de al menos **dos estructuras o mecanismos diferentes de Redis**.
- Eventos estructurados en JSON con los campos mínimos definidos en la sección 5.
- Separación entre estado actual e histórico reciente.
- Procesamiento real de los datos; no basta con almacenarlos y mostrarlos.
- Al menos dos métricas derivadas.
- Al menos una regla de alerta.
- Dashboard web con actualización automática, sin recarga manual.
- Indicadores numéricos o KPIs.
- Al menos dos gráficas temporales.
- Información del estado actual.
- Visualización de eventos o alertas.
- Para este contexto, visualización geográfica de los sensores.
- Documentación de la arquitectura e instrucciones de instalación y ejecución.
- Demostración en vivo del flujo completo.

### 4.2 Recomendados por el profesor

- Redis Streams para conservar y reprocesar eventos recientes.
- TTL o límites de tamaño para controlar el crecimiento de los datos.
- Un intervalo de generación de 5, 10 o 15 segundos, debidamente justificado.
- Leaflet para el mapa y Chart.js o D3.js para las gráficas.
- Comportamientos simulados coherentes: tráfico bajo, medio, alto, congestión y recuperación.
- Introducción controlada de eventos especiales para demostrar alertas y recuperación.
- Definir qué datos requerirían almacenamiento permanente fuera de Redis en un sistema real.

### 4.3 Opcionales o avanzados

- API pública de tráfico como fuente adicional.
- Consumer Groups.
- Sorted Sets y rankings.
- Ventanas temporales y detección de anomalías.
- Múltiples Publishers o Subscribers.
- Docker y despliegue en la nube.
- Reconexión automática y tolerancia a desconexiones.
- Logs y métricas del propio sistema.
- Autenticación.
- Persistencia complementaria en otra base de datos.

Estos elementos pueden mejorar la valoración, pero no sustituyen ningún requisito obligatorio.

## 5. Contrato mínimo de los eventos

Todos los eventos deben respetar una estructura común, independientemente de si provienen del simulador o de una API:

```json
{
  "entity_id": "TRAF-05",
  "timestamp": "2026-09-19T10:30:00Z",
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

Campos mínimos generales:

- `entity_id`: identificador estable del sensor.
- `timestamp`: fecha y hora en formato ISO 8601, preferiblemente UTC.
- `location.latitude` y `location.longitude`: posición del sensor.
- `data`: mediciones propias del dominio.

El esquema definitivo, sus unidades, rangos válidos y reglas de validación siguen pendientes de decisión del grupo.

## 6. Comportamiento esperado del simulador

El simulador no debe generar valores aislados completamente aleatorios. Debe modelar transiciones razonables entre estados y respetar las relaciones del dominio. Por ejemplo:

- cuando aumenta la ocupación, normalmente disminuye la velocidad promedio;
- un incremento del flujo puede preceder a una congestión;
- los valores deben cambiar de forma gradual, salvo en un evento especial controlado;
- una congestión debe poder mantenerse y luego entrar en recuperación;
- las métricas deben permanecer dentro de rangos físicamente razonables.

El intervalo de emisión debe justificarse según la demostración y el contexto. Aún no se ha seleccionado.

## 7. Estado actual, histórico y tiempo real

### Estado actual

Representa la última medición conocida de cada sensor. Debe permitir consultar rápidamente cómo está cada punto en este instante.

Ejemplo conceptual de clave:

```text
sensor:traffic:TRAF-05
```

### Histórico reciente

Representa eventos o mediciones anteriores conservados durante un periodo o hasta un límite de tamaño. No necesita ser permanente.

Ejemplo conceptual:

```text
traffic:stream
```

### Comunicación inmediata

Pub/Sub debe transportar los eventos en tiempo real desde el Publisher hacia uno o más consumidores. Un canal conceptual sugerido por el documento es:

```text
traffic-events
```

La solución debe poder explicar esta diferencia:

- **Pub/Sub:** entrega inmediata; un consumidor desconectado pierde los mensajes emitidos durante la desconexión.
- **Streams:** conserva eventos y permite leerlos o procesarlos posteriormente, dentro de los límites de retención configurados.

Los nombres definitivos de claves, canales y Streams todavía son decisiones del grupo.

## 8. Procesamiento, métricas y alertas

El sistema debe transformar las mediciones recibidas y calcular al menos dos métricas derivadas. Para tráfico, el documento sugiere:

- velocidad promedio global o por zona;
- flujo promedio de vehículos por minuto;
- ocupación promedio;
- variación del tráfico;
- nivel de congestión;
- intersección con mayor congestión;
- ranking de sensores.

Debe existir al menos una regla de alerta, por ejemplo:

- congestión alta;
- velocidad inferior a un umbral;
- aumento repentino del flujo;
- ocupación excesiva.

Las métricas, fórmulas, ventanas temporales y umbrales definitivos todavía no se han acordado.

## 9. Dashboard mínimo

El dashboard debe mostrar y actualizar en tiempo real:

- KPIs numéricos;
- mapa de sensores y estado de cada punto;
- gráfica temporal de velocidad;
- gráfica temporal de vehículos por minuto;
- representación geográfica del nivel de congestión, idealmente mediante colores o mapa de calor;
- estado actual de los sensores;
- lista o panel de alertas y eventos.

La demostración debe evidenciar que un evento nuevo produce un cambio observable sin recargar la página, y el grupo debe poder estimar la latencia entre generación y visualización.

## 10. Persistencia y control de crecimiento

El diseño debe declarar y justificar:

- qué vive únicamente como estado actual;
- qué se conserva como histórico reciente;
- durante cuánto tiempo o hasta cuántos eventos se conserva;
- cómo se evita el crecimiento indefinido de Redis;
- qué información se guardaría permanentemente en un sistema externo en un escenario real.

La política concreta de TTL, retención y tamaño máximo queda pendiente.

## 11. Demostración esperada

La presentación debería recorrer este flujo observable:

1. Mostrar o iniciar la fuente de datos.
2. Mostrar el Publisher.
3. Generar un evento nuevo.
4. Evidenciar su publicación o almacenamiento en Redis.
5. Mostrar el procesamiento y las métricas derivadas.
6. Mostrar la actualización automática del dashboard.
7. Forzar una condición de alerta.
8. Ver el cambio correspondiente en el dashboard.
9. Consultar el estado actual de un sensor.
10. Consultar el histórico reciente.

No debe depender de capturas de pantalla ni de la disponibilidad de una API externa.

## 12. Entregables

### Repositorio Git

Debe contener:

- Publisher;
- Subscriber/Processor;
- configuración de Redis;
- aplicación web;
- simulador;
- archivos de configuración;
- instrucciones de ejecución.

### Documento técnico

Debe explicar:

- problema;
- arquitectura;
- tecnologías;
- fuente de datos;
- estructura de eventos;
- estructuras de Redis;
- canales Pub/Sub;
- Streams, si se usan;
- procesamiento;
- métricas;
- alertas;
- dashboard;
- instalación y ejecución;
- dificultades;
- conclusiones.

### Producto y exposición

- Dashboard funcional y demostrable.
- Presentación en la que los cuatro integrantes puedan explicar la solución completa.

## 13. Prioridades según la evaluación

| Criterio | Peso |
|---|---:|
| Uso correcto de Redis | 20% |
| Arquitectura y diseño | 15% |
| Procesamiento y métricas | 15% |
| Dashboard y visualización | 15% |
| Publisher y fuente de datos | 10% |
| Comunicación en tiempo real | 10% |
| Alertas y comportamiento dinámico | 5% |
| Documentación | 5% |
| Presentación y dominio técnico | 5% |

La arquitectura debe priorizar un uso claro y demostrable de Redis, el procesamiento y la visualización antes que características accesorias.

## 14. Criterios de aceptación verificables

- [ ] El sistema arranca siguiendo instrucciones reproducibles.
- [ ] Redis participa en comunicación, estado actual, histórico reciente y métricas.
- [ ] El simulador produce eventos continuos, válidos y coherentes.
- [ ] La misma interfaz de Publisher admite simulador y futura fuente real.
- [ ] Pub/Sub comunica los eventos a uno o más consumidores.
- [ ] Se usan al menos dos estructuras o mecanismos de Redis y se justifica cada uno.
- [ ] Se puede consultar la última medición de cada sensor.
- [ ] Se puede consultar el histórico reciente.
- [ ] Se calculan al menos dos métricas derivadas.
- [ ] Se genera y visualiza al menos una alerta.
- [ ] El dashboard tiene KPIs, mapa, dos gráficas temporales y alertas.
- [ ] El dashboard cambia sin recarga manual al llegar eventos.
- [ ] Existe una política explícita de retención o expiración.
- [ ] La demostración puede realizarse sin servicios externos.
- [ ] Los cuatro integrantes pueden explicar el recorrido completo de un evento.

## 15. Decisiones del grupo aún pendientes

Este documento no presupone respuestas para los siguientes puntos:

1. Lenguaje y framework del backend.
2. Tecnología del frontend y mecanismo de actualización en tiempo real.
3. Uso de una API real además del simulador.
4. Número y ubicación conceptual de sensores.
5. Intervalo de generación de eventos.
6. Variables exactas, unidades y rangos permitidos.
7. Modelo de escenarios realistas del simulador.
8. Estructuras de Redis y esquema exacto de claves.
9. Uso de Redis Streams y posible Consumer Group.
10. Métricas, fórmulas y ventanas temporales.
11. Reglas y umbrales de alerta.
12. Retención, TTL y tamaño máximo del histórico.
13. Estrategia de ejecución local, Docker o nube.
14. División del trabajo entre los cuatro integrantes.
15. Alcance mínimo frente a características avanzadas.

## 16. Registro de decisiones

Toda decisión del equipo deberá añadirse en una tabla como esta, sin modificar silenciosamente los requisitos del profesor:

| ID | Decisión | Motivo | Impacto | Estado |
|---|---|---|---|---|
| ADR-001 | Utilizar exclusivamente un simulador como fuente en la primera versión | Evita credenciales, pagos y disponibilidad externa; el modo simulado ya es obligatorio | Demostración reproducible; el Publisher conservará una interfaz desacoplada | Propuesta |
| ADR-002 | Seis sensores fijos ubicados en Sogamoso | Cantidad legible en mapa, gráficas y ranking | Se requiere definir coordenadas y longitud de cada tramo | Propuesta |
| ADR-003 | Un evento por sensor cada 10 segundos | Ritmo visible sin saturar el dashboard | Produce 36 eventos/minuto | Propuesta |
| ADR-004 | Node.js y cliente oficial `redis` | Un solo lenguaje para generación, publicación y procesamiento | Simplifica aprendizaje e integración | Propuesta |
| ADR-005 | Pub/Sub + Hashes + Streams + Sorted Sets | Responsabilidades claras para comunicación, estado, histórico y ranking | Demuestra uso relevante de Redis | Propuesta |
| ADR-006 | Grafana OSS + Redis Data Source como aplicación web | Evita construir frontend y servidor Socket.IO manuales | Requiere validar compatibilidad y Geomap antes de cerrar la arquitectura | Propuesta |
| ADR-007 | Histórico limitado con `MAXLEN ~ 360` | Con seis eventos cada 10 s cubre aproximadamente 10 minutos | Corrige el cálculo inicial de 100 eventos | Propuesta |
| ADR-008 | Alertas activas por sensor con TTL de 60 s y borrado al recuperarse | Impide alertas obsoletas y demuestra expiración | Grafana consultará seis claves fijas | Propuesta |

Estados sugeridos: `Propuesta`, `Aprobada`, `Reemplazada` o `Descartada`.

## 17. Preguntas de defensa técnica

Antes de entregar, el equipo debe preparar respuestas breves y consistentes sobre:

- por qué Redis es adecuado y cuáles son sus limitaciones;
- diferencia entre estado actual, histórico reciente y persistencia permanente;
- función del Publisher y del Subscriber/Processor;
- diferencia entre Pub/Sub y Streams;
- qué pasa si un Subscriber o Redis se desconectan;
- cómo se controla el crecimiento de los datos;
- cómo se generan datos realistas;
- cómo se calculan las métricas y alertas;
- qué parte del sistema es realmente en tiempo real;
- cómo escalarían Publishers, consumidores y dashboard;
- qué componentes podrían escalar horizontalmente.

## 18. Regla de mantenimiento de esta fuente de verdad

- Los requisitos del profesor se registran como `Obligatorio`, `Recomendado` u `Opcional`.
- Las elecciones del equipo se registran como decisiones y deben incluir una justificación.
- Si una decisión cambia, se conserva el motivo del cambio.
- El README final podrá resumir la ejecución, pero este documento conservará el contexto completo y la trazabilidad.
