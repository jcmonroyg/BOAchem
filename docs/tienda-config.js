// Configuración de la tienda. Carga este archivo ANTES de carrito.js.
window.TIENDA_CONFIG = {
  // Catálogo con productos, precios y costo de envío.
  catalogoUrl: 'productos.json',

  // Imagen del botón flotante del carrito (la misma que usa products.html).
  iconoCarrito: 'icono-carrito.svg',

  // URL de tu Cloudflare Worker (lo crearemos en el siguiente paso).
  // Mientras esté vacío, el carrito funciona pero el botón de pago avisa
  // que los pagos aún no están configurados.
  workerUrl: '',

  // Página a la que vuelve el cliente después de pagar (por ejemplo, con PSE).
  urlGracias: new URL('gracias.html', location.href).href,

  // Enlaces legales que el cliente acepta antes de pagar.
  urlTerminos: 'terminos.html',
  urlPrivacidad: 'privacidad.html',

  // Máximo de unidades por producto en un pedido.
  maxPorProducto: 10,

  // Texto que aparece en "Envío" cuando el carrito tiene algún producto con
  // "envio": true y el pedido no alcanza el envío gratis.
  mensajeEnvioEspecial: 'El carrito contiene un ITEM cuyo envio no está incluido. Completa tu compra, un asesor se contactará contigo lo más pronto posible para concretar los detalles de envio, incluido su costo, el valor del envio puede ser pagado a contraentrega. Si prefieres estimar primero el valor del envio antes de continuar con esta compra, porsupuesto! Contáctanos, estamos bien pendientes.'
  
};
