/*
 * Botones flotantes de WhatsApp + carrito (mismo diseño que products.html y tienda.html).
 * Uso: antes de </body> agrega
 *   <script src="botones.js"></script>
 * Opcional, mensaje de WhatsApp propio para esa página:
 *   <script src="botones.js" data-mensaje="Hola BOAchem, quiero cotizar ..."></script>
 * Opcional, sin carrito (solo WhatsApp):
 *   <script src="botones.js" data-carrito="no"></script>
 */
(function () {
  var NUMERO = '573204126204';            // WhatsApp que recibe los mensajes
  var ETIQUETA = '[Web] ';                 // marca para saber que el contacto viene de la página
  var ICONO_CARRITO = 'icono-carrito.svg'; // la misma imagen que usa la tienda
  var PAGINA_TIENDA = 'tienda.html';

  var yo = document.currentScript;
  var mensaje = (yo && yo.dataset.mensaje) || 'Hola BOAchem, quisiera más información.';
  var conCarrito = !(yo && yo.dataset.carrito === 'no');

  function montar() {
    var css = document.createElement('style');
    css.textContent =
      '.bf-stack{position:fixed;right:1.25rem;bottom:calc(1.25rem + env(safe-area-inset-bottom,0px));z-index:900;display:flex;flex-direction:column;gap:12px}' +
      '.bf{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;text-decoration:none;transition:transform .15s}' +
      '.bf:hover{transform:translateY(-2px) scale(1.04)}' +
      '.bf-wa{background:#25D366;color:#fff;box-shadow:0 6px 18px rgba(37,211,102,.35)}' +
      '.bf-wa svg{width:30px;height:30px}' +
      '.bf-cart{box-shadow:0 6px 18px rgba(225,29,46,.35)}' +
      '.bf-cart img{width:100%;height:100%;display:block;border-radius:50%}' +
      /* en tienda.html el carrito real ocupa la esquina: WhatsApp va encima */
      '.bf-stack.bf-sobre-carrito{bottom:calc(1.25rem + 70px + env(safe-area-inset-bottom,0px))}';
    document.head.appendChild(css);

    var hayCarritoReal = !!document.querySelector('.cc-abrir');
    var caja = document.createElement('div');
    caja.className = 'bf-stack' + (hayCarritoReal ? ' bf-sobre-carrito' : '');

    var wa = document.createElement('a');
    wa.className = 'bf bf-wa';
    wa.href = 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(ETIQUETA + mensaje);
    wa.target = '_blank';
    wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'Escríbenos por WhatsApp');
    wa.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
    caja.appendChild(wa);

    if (conCarrito && !hayCarritoReal) {
      var cart = document.createElement('a');
      cart.className = 'bf bf-cart';
      cart.href = PAGINA_TIENDA;
      cart.setAttribute('aria-label', 'Ir a la tienda');
      cart.innerHTML = '<img src="' + ICONO_CARRITO + '" alt="">';
      caja.appendChild(cart);
    }
    document.body.appendChild(caja);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
