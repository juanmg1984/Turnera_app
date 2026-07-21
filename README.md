# Turnos de Carga — Aeroplanta San Fernando (SADF)

Sistema web de gestión de turnos de abastecimiento de combustible para aeronaves en el
Aeropuerto de San Fernando. Backend Node.js + Express con base de datos SQLite
(archivo local en desarrollo, [Turso](https://turso.tech) en la nube), frontend SPA sin
dependencias y login por roles.

**Alcance:** el flujo termina cuando el coordinador **asigna abastecedora y operador** al
turno (o lo cancela). La operación de carga y el cierre del viaje se gestionan en otro
sistema. El cliente recibe el feedback de la asignación dentro de la app (campanita 🔔 y
estado en "Mis turnos").

## Cómo ejecutarlo

```
npm install
node server.js
# → http://localhost:8642
```

La base `turnera.db` se crea y se puebla sola en el primer arranque.
Para publicarlo gratis en la nube: ver [DEPLOY.md](DEPLOY.md) (Render + Turso).

### Usuarios iniciales

| Rol | Email | Contraseña |
|---|---|---|
| admin | juanmg1984@gmail.com | `admin1234` |
| coordinador | coordinador@sanfernando.demo | `coord1234` |
| cliente demo | demo@americanjet.demo | `cliente1234` |

Cambiá estas contraseñas en el primer uso (Maestros → Usuarios).

## Roles y permisos

| Capacidad | Cliente | Coordinador | Admin |
|---|---|---|---|
| Registro autogestionado (crea SU cliente + un único usuario) | ✅ | — | — |
| Pedir turnos (solo con matrículas de su cliente) | ✅ | — | — |
| Alta de aeronave en la primera carga | ✅ | ✅ | ✅ |
| Cancelar turnos (motivo obligatorio) | ✅ (los suyos) | ✅ | ✅ |
| Dashboard operativo del día | — | ✅ | ✅ |
| Asignar abastecedora + operador | — | ✅ | ✅ |
| **Confirmar abastecimiento** (abastecido / no se presentó) | — | ✅ | ✅ |
| **Turno manual** (teléfono / mostrador), con sobreturno opcional | — | ✅ | ✅ |
| Reprogramar horario (comentario al cliente obligatorio) | — | ✅ | ✅ |
| Agregar usuarios adicionales a un cliente | — | ✅ | ✅ |
| **ABM de clientes, matrículas, hangares y abastecedoras** (incluye eliminar posiciones) | — | ✅ | ✅ |
| ABM de operadores y usuarios | — | — | ✅ |
| **Claves de la API de consulta** (generar / revocar) | — | — | ✅ |
| **Cambiar el grado de una matrícula ya asignado** | — | — | ✅ (con confirmación escrita) |
| Configurar la grilla de turnos (intervalo — 15 min por defecto —, horario, capacidad, anticipación) | — | — | ✅ |

Reglas clave:
- Las **matrículas son únicas en todo el maestro** y están **asociadas a un cliente**: ningún
  usuario puede pedir turnos para aeronaves de otro cliente.
- **Flujo del pedido**: primero se elige la **aeronave** (define el grado), y recién entonces se
  muestra la **disponibilidad de horarios calculada según las abastecedoras de ese grado**
  (ej. si hay 1 sola abastecedora de AVGAS, cada horario admite 1 carga de AVGAS a la vez).
- **Estados del turno**: PENDIENTE → PROGRAMADO → **ABASTECIDO** (se cargó) | **AUSENTE** (no se
  presentó), o CANCELADO. El coordinador confirma el resultado con un botón; los turnos
  PROGRAMADOS de días pasados que no se gestionen se asumen **ABASTECIDOS al cierre del día**.
- **Turno manual del coordinador** (teléfono / mostrador): buscador de matrículas con filtro por
  cliente, **alta de aeronave y de cliente en el momento**, y **cualquier horario** (dentro o
  fuera de la grilla). Opcionalmente **sobreturno**: no consume la capacidad ni el equipo de los
  turnos ya asignados.
- **Abastecedoras fuera de servicio**: el estado "fuera de servicio" solo restringe **el día en
  curso**. Para turnos futuros se puede planificar con un equipo que hoy está en taller.
- **API de consulta** de solo lectura con app key para integrar BI/reportes — ver [API.md](API.md).
- El **registro autogestionado permite un solo usuario por cliente**; los usuarios adicionales
  los agrega únicamente el coordinador (o el admin).
- Toda programación, reprogramación, cancelación o confirmación hecha por la planta genera una
  **notificación al cliente** dentro de la app.
- **Mails de gestión de usuarios** (vía [Brevo](https://www.brevo.com), gratis — ver
  [DEPLOY.md](DEPLOY.md) paso 5): bienvenida con credenciales al crear un usuario, aviso al
  restablecer contraseña, y recuperación autogestionada "¿Olvidaste tu contraseña?" con link
  de un solo uso que vence en 1 hora. Todos los usuarios pueden cambiar su propia contraseña
  (botón 🔑). Sin configurar Brevo, el sistema funciona igual (credenciales a mano).

## Barreras anti-misfuelling (defensa en profundidad)

**Misfuelling** es cargar un grado de combustible equivocado. El caso más grave es JET A-1 en
un motor a pistón que requiere AVGAS 100LL: funciona en tierra y falla en vuelo. Barreras:

1. **Grado bloqueado por matrícula**: lo fija el maestro; el cliente no lo elige nunca y solo
   el admin puede cambiarlo escribiendo `CAMBIAR GRADO <MATRÍCULA>`.
2. **Coherencia motor ↔ grado en el alta** (turbina → JET A-1, pistón → AVGAS 100LL); las
   excepciones (diésel aeronáutico) exigen confirmación escrita y quedan marcadas.
3. **Matrículas únicas y por cliente** + **detección de matrículas parecidas** (distancia ≤ 1).
3b. **Canonicalización de matrículas**: el usuario la escribe sin guión (o como sea) y el
   sistema arma la forma única según el prefijo de país (`lvuno`, `LV-UNO` y `lv uno` →
   `LV-UNO`; `n123ab` → `N123AB`), validando el formato (LV/LQ Argentina, N EE.UU., CX, CC,
   CP, ZP, OB, HK y PR/PT/PP/PS/PU Brasil). Imposible duplicar una matrícula por tipeo.
3c. **Verificación asistida contra registro externo** ([adsbdb.com](https://www.adsbdb.com), base
   pública ADS-B): al dar de alta, el sistema busca la matrícula; si la encuentra precarga
   tipo/fabricante/operador y **cruza el tipo real contra el motor declarado** (si el registro
   dice que es un jet y se declaró pistón/AVGAS → alerta roja). Un "no encontrada" no bloquea
   (mucha aviación general no figura); ahí rige la validación de formato + documentación.
   No existe API pública oficial de ANAC/FAA/OACI para esto; ver conversación en DEPLOY.
4. **Confirmación positiva**: tipear la matrícula exacta al confirmar el turno (validada
   también en el servidor).
5. **Bloqueo duro en la asignación**: el servidor rechaza cualquier abastecedora de grado
   distinto al del pedido; en la UI aparecen deshabilitadas.
6. **Abastecedoras monogrado** y validación de volumen contra la capacidad de la aeronave.
7. **El cambio de grado cancela los turnos activos** de esa matrícula y notifica al cliente.
8. **Código de colores internacional** en toda la interfaz: JET A-1 negro, AVGAS 100LL rojo.

## Archivos

- [server.js](server.js) — API Express: auth, roles, turnos, maestros, notificaciones
- [db.js](db.js) — capa de datos (node:sqlite local / Turso en producción), esquema y seed
- [auth.js](auth.js) — hash de contraseñas (scrypt) y sesiones
- [public/](public/index.html) — SPA (login, wizard del cliente, agenda del coordinador, maestros y configuración del admin)
- [DEPLOY.md](DEPLOY.md) — publicación gratuita en Render + Turso
