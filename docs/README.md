# Carrito de compras para GitHub Pages + Wompi

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `productos.json` | Catálogo: productos, precios (en pesos, sin decimales) y costo de envío. Es la única fuente de precios: el Worker también lo leerá. |
| `tienda-config.js` | Configuración: URL del Worker, página de regreso y enlaces legales. |
| `carrito.js` | Lógica del carrito, panel lateral, formulario de envío y apertura del pago de Wompi. |
| `carrito.css` | Estilos. Cambia los colores en las variables `--cc-*` al inicio del archivo. |
| `tienda.html` | Página de ejemplo con el catálogo. |
| `gracias.html` | Página a la que vuelve el cliente después de pagar (PSE siempre redirige aquí). |

## Cómo instalarlo en tu sitio

1. Copia los archivos a tu repositorio de GitHub Pages (en la raíz o en una carpeta).
2. En cada página donde quieras el carrito, agrega en el `<head>`:
   ```html
   <link rel="stylesheet" href="carrito.css">
   ```
   y antes de cerrar `</body>`:
   ```html
   <script src="tienda-config.js"></script>
   <script src="carrito.js"></script>
   ```
3. Para mostrar el catálogo automáticamente, pon `<div id="tienda-productos"></div>` donde quieras la grilla.
   Si prefieres tus propias tarjetas, usa en cualquier botón `data-agregar="id-del-producto"`.
4. Sube tus fotos a la carpeta `img/` con los nombres de `productos.json` (o cambia las rutas).
5. Crea `terminos.html` y `privacidad.html` (o cambia sus rutas en `tienda-config.js`).

El carrito se guarda en el navegador del cliente, así que sigue ahí si cierra la página.

## Cambiar productos o precios

Edita `productos.json` y haz commit. Para ocultar un producto sin borrarlo, pon `"activo": false`.
Los `id` no deben cambiar una vez publicados (son los que guarda el carrito del cliente).

## Contrato con el Worker (siguiente paso)

El carrito espera dos rutas en `workerUrl`:

**`POST /checkout`**, recibe:
```json
{
  "items": [{ "id": "lavanda-10ml", "cantidad": 2 }],
  "cliente": { "nombre": "", "email": "", "celular": "", "tipoDocumento": "CC", "documento": "",
               "direccion": "", "ciudad": "", "departamento": "", "notas": "" }
}
```
y responde:
```json
{ "reference": "PED-...", "amountInCents": 7600000, "currency": "COP",
  "publicKey": "pub_test_...", "signature": "<sha256 de integridad>" }
```
o, si hay un problema, un código 4xx/5xx con `{ "error": "mensaje para el cliente" }`.

**`GET /estado?id=ID_TRANSACCION`**, responde `{ "status": "APPROVED|PENDING|DECLINED|...", "reference": "PED-..." }`.

El Worker recalcula el total con `productos.json`, nunca con precios enviados por el navegador.
