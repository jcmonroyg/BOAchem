/**
 * Worker de pagos para la tienda en GitHub Pages + Wompi.
 *
 * Rutas:
 *   POST /checkout   Recalcula el total con productos.json, guarda el pedido y firma el pago.
 *   POST /webhook    Recibe los eventos de Wompi, verifica su firma y actualiza el pedido.
 *   GET  /estado     Consulta en Wompi el estado de una transacción (?id=...).
 *
 * Variables (Settings > Variables and Secrets):
 *   WOMPI_ENV               "sandbox" o "production"           (texto)
 *   WOMPI_PUBLIC_KEY        pub_test_... o pub_prod_...        (texto)
 *   WOMPI_INTEGRITY_SECRET  test_integrity_... / prod_integrity_...  (SECRETO)
 *   WOMPI_EVENTS_SECRET     test_events_... / prod_events_...  (SECRETO)
 *   CATALOGO_URL            https://tuusuario.github.io/productos.json (texto)
 *   ALLOWED_ORIGINS         https://tuusuario.github.io,http://localhost:8000 (texto)
 * Enlace (Settings > Bindings):
 *   PEDIDOS                 KV namespace donde se guardan los pedidos
 */

const MAX_POR_PRODUCTO = 10;
const MAX_LINEAS = 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/checkout' && request.method === 'POST') return await checkout(request, env, cors);
      if (url.pathname === '/webhook' && request.method === 'POST') return await webhook(request, env);
      if (url.pathname === '/estado' && request.method === 'GET') return await estado(url, env, cors);
      return json({ error: 'Ruta no encontrada.' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'Error interno. Inténtalo de nuevo en unos minutos.' }, 500, cors);
    }
  }
};

// ---------------------------------------------------------------- /checkout
async function checkout(request, env, cors) {
  if (!origenPermitido(request, env)) {
    return json({ error: 'Origen no permitido.' }, 403, cors);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Solicitud inválida.' }, 400, cors); }

  const { items, cliente } = body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINEAS) {
    return json({ error: 'Tu carrito está vacío o no es válido.' }, 400, cors);
  }
  const errorCliente = validarCliente(cliente);
  if (errorCliente) return json({ error: errorCliente }, 400, cors);

  // Precios reales: SIEMPRE desde el catálogo publicado, nunca desde el navegador.
  const catalogo = await cargarCatalogo(env);
  const agotado = p => p.agotado === true || String(p.agotado).toLowerCase() === 'true';
  const porId = new Map(catalogo.productos.filter(p => p.activo !== false && !agotado(p)).map(p => [p.id, p]));

  const lineas = [];
  let subtotal = 0;
  for (const it of items) {
    const p = porId.get(String(it && it.id));
    const cantidad = Number(it && it.cantidad);
    if (!p) return json({ error: 'Uno de los productos ya no está disponible. Actualiza la página.' }, 409, cors);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_POR_PRODUCTO) {
      return json({ error: 'Cantidad no válida en el carrito.' }, 400, cors);
    }
    if (!Number.isInteger(p.precio) || p.precio <= 0) throw new Error(`Precio inválido en catálogo: ${p.id}`);
    subtotal += p.precio * cantidad;
    lineas.push({ id: p.id, nombre: p.nombre, precio: p.precio, cantidad });
  }

  const { costo = 0, gratisDesde = null } = catalogo.envio || {};
  const gratis = gratisDesde && subtotal >= gratisDesde;
  // Productos con "envio": true: si no hay envío gratis, el envío se gestiona aparte.
  const esVerdadero = v => v === true || String(v).toLowerCase() === 'true';
  const envioPorGestionar = !gratis && lineas.some(l => esVerdadero(porId.get(l.id).envio));
  const envio = gratis || envioPorGestionar ? 0 : costo;
  const total = subtotal + envio;
  const amountInCents = total * 100;
  const currency = 'COP';
  const reference = nuevaReferencia();

  const signature = await sha256(`${reference}${amountInCents}${currency}${env.WOMPI_INTEGRITY_SECRET}`);

  const pedido = {
    reference,
    estado: 'CREADO',
    creado: new Date().toISOString(),
    items: lineas,
    subtotal, envio, total,
    cliente: limpiarCliente(cliente),
    envioPorGestionar,
    ambiente: env.WOMPI_ENV
  };
  await env.PEDIDOS.put(`pedido:${reference}`, JSON.stringify(pedido));

  return json({ reference, amountInCents, currency, publicKey: env.WOMPI_PUBLIC_KEY, signature }, 200, cors);
}

// ---------------------------------------------------------------- /webhook
async function webhook(request, env) {
  let evento;
  try { evento = await request.json(); } catch { return new Response('Solicitud inválida', { status: 400 }); }

  if (!(await firmaEventoValida(evento, env.WOMPI_EVENTS_SECRET))) {
    console.warn('Evento con firma inválida descartado');
    return new Response('Firma inválida', { status: 401 });
  }

  if (evento.event !== 'transaction.updated') return new Response('OK');

  const tx = evento.data && evento.data.transaction;
  if (!tx || !tx.reference) return new Response('OK');

  const clave = `pedido:${tx.reference}`;
  const guardado = await env.PEDIDOS.get(clave);
  if (!guardado) {
    console.warn('Evento para un pedido desconocido:', tx.reference);
    return new Response('OK');
  }

  const pedido = JSON.parse(guardado);
  const montoEsperado = pedido.total * 100;

  pedido.estado = tx.amount_in_cents === montoEsperado ? tx.status : 'REVISAR_MONTO';
  pedido.transaccion = {
    id: tx.id,
    estado: tx.status,
    monto: tx.amount_in_cents,
    medio: tx.payment_method_type,
    fecha: tx.finalized_at || tx.created_at || null
  };
  pedido.actualizado = new Date().toISOString();
  await env.PEDIDOS.put(clave, JSON.stringify(pedido));

  // Wompi reintenta si no recibe un 200, así que respondemos OK siempre que la firma sea válida.
  return new Response('OK');
}

async function firmaEventoValida(evento, secreto) {
  const firma = evento && evento.signature;
  if (!firma || !Array.isArray(firma.properties) || !firma.checksum || evento.timestamp == null || !secreto) return false;

  let cadena = '';
  for (const ruta of firma.properties) {
    const valor = ruta.split('.').reduce((obj, k) => (obj == null ? undefined : obj[k]), evento.data);
    if (valor === undefined) return false;
    cadena += String(valor);
  }
  cadena += String(evento.timestamp) + secreto;

  const calculada = await sha256(cadena);
  return iguales(calculada, String(firma.checksum).toLowerCase());
}

// ---------------------------------------------------------------- /estado
async function estado(url, env, cors) {
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9-]{5,80}$/.test(id)) return json({ error: 'Identificador no válido.' }, 400, cors);

  const base = env.WOMPI_ENV === 'production' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';
  const resp = await fetch(`${base}/transactions/${encodeURIComponent(id)}`);
  if (!resp.ok) return json({ error: 'No se pudo consultar la transacción.' }, 502, cors);

  const { data } = await resp.json();
  return json({ status: data.status, reference: data.reference }, 200, cors);
}

// ---------------------------------------------------------------- utilidades
async function cargarCatalogo(env) {
  const resp = await fetch(env.CATALOGO_URL, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!resp.ok) throw new Error(`No se pudo leer el catálogo (${resp.status})`);
  const datos = await resp.json();
  if (!Array.isArray(datos.productos)) throw new Error('Catálogo sin productos');
  return datos;
}

function validarCliente(c) {
  if (!c || typeof c !== 'object') return 'Faltan los datos de envío.';
  const texto = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
  if (!texto(c.nombre, 5, 100)) return 'Revisa el nombre.';
  if (!texto(c.email, 5, 120) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) return 'Revisa el correo electrónico.';
  if (!/^3\d{9}$/.test(String(c.celular || '').trim())) return 'Revisa el celular (10 dígitos, empieza por 3).';
  if (!['CC', 'CE', 'NIT', 'PP'].includes(c.tipoDocumento)) return 'Revisa el tipo de documento.';
  if (!/^[0-9A-Za-z]{5,15}$/.test(String(c.documento || '').trim())) return 'Revisa el número de documento.';
  if (!texto(c.direccion, 6, 200)) return 'Revisa la dirección.';
  if (!texto(c.ciudad, 2, 80)) return 'Revisa la ciudad.';
  if (!texto(c.departamento, 2, 60)) return 'Revisa el departamento.';
  return null;
}

function limpiarCliente(c) {
  const t = (v, max) => String(v || '').trim().slice(0, max);
  return {
    nombre: t(c.nombre, 100), email: t(c.email, 120), celular: t(c.celular, 10),
    tipoDocumento: t(c.tipoDocumento, 5), documento: t(c.documento, 15),
    direccion: t(c.direccion, 200), ciudad: t(c.ciudad, 80),
    departamento: t(c.departamento, 60), notas: t(c.notas, 300)
  };
}

function nuevaReferencia() {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const azar = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `PED-${fecha}-${azar}`;
}

async function sha256(texto) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function origenes(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}
function origenPermitido(request, env) {
  return origenes(env).includes(request.headers.get('Origin'));
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && origenes(env).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
