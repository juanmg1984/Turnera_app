# API de consulta (v1)

Servicio **de solo lectura** para integrar el sistema de turnos con otras herramientas
(BI, reportes, tableros). Pensado para consultar turnos, clientes, matrículas,
abastecedoras y hangares desde afuera de la aplicación.

## Autenticación — app key

Las claves las genera el **rol admin** desde **Configuración → API de consulta**.
La clave se muestra **una sola vez** al crearla (en la base se guarda solo su hash):
si se pierde, hay que generar otra y revocar la anterior.

Enviala en cada pedido:

```
X-API-Key: sf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

También se acepta `Authorization: Bearer sf_live_…`.

Respuestas de error: `401` sin clave o clave inválida, `403` si la clave fue revocada.
Cada uso queda registrado (contador y fecha de último uso) y es visible en el panel de admin.

## Endpoints

| Método y ruta | Descripción |
|---|---|
| `GET /api/v1` | Índice del servicio y lista de endpoints |
| `GET /api/v1/turnos` | Turnos. Filtros: `desde`, `hasta`, `estado`, `cliente`, `matricula`, `limit` |
| `GET /api/v1/clientes` | Clientes con cantidad de aeronaves y turnos |
| `GET /api/v1/aeronaves` | Maestro de matrículas. Filtros: `cliente`, `grado` |
| `GET /api/v1/abastecedoras` | Equipos, su grado y capacidad |
| `GET /api/v1/hangares` | Hangares y posiciones |
| `GET /api/v1/resumen` | Totales por estado, grado y cliente. Filtros: `desde`, `hasta` |

`limit` por defecto 500, máximo 2000. Las fechas van en formato `YYYY-MM-DD`.
Los estados posibles son `PENDIENTE`, `PROGRAMADO`, `ABASTECIDO`, `AUSENTE`, `CANCELADO`.

## Ejemplos

```bash
# Turnos abastecidos de julio
curl -H "X-API-Key: sf_live_…" \
  "https://TU-APP/api/v1/turnos?desde=2026-07-01&hasta=2026-07-31&estado=ABASTECIDO"

# Matrículas de un cliente
curl -H "X-API-Key: sf_live_…" \
  "https://TU-APP/api/v1/aeronaves?cliente=american"

# Resumen del mes (por estado, grado y cliente)
curl -H "X-API-Key: sf_live_…" \
  "https://TU-APP/api/v1/resumen?desde=2026-07-01&hasta=2026-07-31"
```

Respuesta de `/api/v1/turnos`:

```json
{
  "total": 1,
  "turnos": [{
    "codigo": "T-0002", "fecha": "2026-07-22", "hora": "07:03",
    "matricula": "LV-CDS", "tipo_aeronave": "Learjet 60", "grado": "JET A-1",
    "volumen": 3000, "forma_pago": "CUENTA CORRIENTE", "hangar": "H5",
    "estado": "PROGRAMADO", "abastecedora": "AB-01", "operador": "Carlos Medina",
    "sobreturno": 0, "origen": "MANUAL", "cliente": "American Jet S.A."
  }]
}
```

## Buenas prácticas

- Una clave por integración (así se puede revocar una sin afectar al resto).
- No la pongas en código de frontend ni en repositorios públicos: es de servidor a servidor.
- Si sospechás que se filtró, revocala desde el panel y generá una nueva.
