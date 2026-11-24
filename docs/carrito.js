/*
 * Carrito de compras para sitios estáticos (GitHub Pages) con pago por Wompi.
 *
 * Seguridad: el navegador solo envía al Worker los ID de producto y las cantidades.
 * El Worker vuelve a calcular el total con productos.json y genera la firma de
 * integridad de Wompi, así nadie puede cambiar el precio desde el navegador.
 */
(function () {
  'use strict';

  const CFG = Object.assign({
    catalogoUrl: 'productos.json',
    workerUrl: '',
    urlGracias: new URL('gracias.html', location.href).href,
    urlTerminos: 'terminos.html',
    urlPrivacidad: 'privacidad.html',
    maxPorProducto: 10,
    mensajeEnvioEspecial: 'El carrito contiene un ITEM cuyo envio no está incluido. Completa tu compra, un asesor se contactará contigo lo más pronto posible para concretar los detalles de envio, incluido su costo, el valor del envio puede ser pagado a contraentrega. Si prefieres estimar primero el valor del envio antes de continuar con esta compra, porsupuesto! Contáctanos, estamos bien pendientes.'
  }, window.TIENDA_CONFIG || {});

  const CLAVE = 'carrito_v1';
  const WIDGET_URL = 'https://checkout.wompi.co/widget.js';
  const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  const DEPARTAMENTOS = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá',
    'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía',
    'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo',
    'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca',
    'Vaupés', 'Vichada'];

  let catalogo = { envio: { costo: 0, gratisDesde: null }, productos: [] };
  const porId = new Map();
  let carrito = leer();       // { idProducto: cantidad }
  let paso = 'carrito';       // 'carrito' | 'datos'
  let ultimoFoco = null;
  const ui = {};

  // ---------- Almacenamiento ----------
  function leer() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE) || '{}');
      return datos && typeof datos === 'object' ? datos : {};
    } catch (e) { return {}; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(carrito)); } catch (e) { /* modo privado: el carrito vive solo en esta visita */ }
  }

  // ---------- Utilidades ----------
  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function cantidadTotal() {
    return Object.values(carrito).reduce((a, n) => a + n, 0);
  }
  function totales() {
    let subtotal = 0;
    for (const [id, n] of Object.entries(carrito)) {
      const p = porId.get(id);
      if (p) subtotal += p.precio * n;
    }
    const { costo = 0, gratisDesde = null } = catalogo.envio || {};
    const gratis = gratisDesde && subtotal >= gratisDesde;
    // Si algún producto tiene "envio": true y no se alcanza el envío gratis,
    // el envío no se cobra aquí: se calcula y gestiona aparte con un asesor.
    const especial = Object.keys(carrito).some(id => porId.get(id) && esVerdadero(porId.get(id).envio));
    const envioPendiente = subtotal > 0 && !gratis && especial;
    const envio = subtotal === 0 || gratis || envioPendiente ? 0 : costo;
    return { subtotal, envio, envioPendiente, total: subtotal + envio, gratisDesde };
  }

  // ---------- Operaciones del carrito ----------
  // "agotado" acepta true/false del JSON, y también el texto "True"/"False".
  function esVerdadero(v) {
    return v === true || String(v).toLowerCase() === 'true';
  }
  function esAgotado(p) {
    return esVerdadero(p.agotado);
  }

  function agregar(id, n = 1) {
    if (!porId.has(id) || esAgotado(porId.get(id))) return;
    carrito[id] = Math.min((carrito[id] || 0) + n, CFG.maxPorProducto);
    guardar();
    actualizar();
    ui.contador.classList.remove('cc-pulso');
    void ui.contador.offsetWidth; // reinicia la animación
    ui.contador.classList.add('cc-pulso');
  }
  function cambiar(id, n) {
    if (n <= 0) delete carrito[id];
    else carrito[id] = Math.min(n, CFG.maxPorProducto);
    guardar();
    actualizar();
  }
  function vaciar() {
    carrito = {};
    guardar();
    if (ui.panel) actualizar();
  }

  // ---------- Interfaz ----------
  function crearInterfaz() {
    // Ícono compartido con products.html: cámbialo en tienda-config.js (iconoCarrito) o reemplazando icono-carrito.svg
    const icono = '<img class="cc-icono" src="' + (CFG.iconoCarrito || 'icono-carrito.svg') + '" alt="">';

    const abrirBtn = document.createElement('button');
    abrirBtn.className = 'cc-abrir';
    abrirBtn.type = 'button';
    abrirBtn.setAttribute('aria-label', 'Abrir carrito');
    abrirBtn.innerHTML = icono + '<span class="cc-contador" hidden>0</span>';

    const velo = document.createElement('div');
    velo.className = 'cc-velo';
    velo.hidden = true;

    const panel = document.createElement('aside');
    panel.className = 'cc-panel cc-oculto';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'cc-titulo');
    panel.innerHTML = `
      <div class="cc-cabecera">
        <h2 id="cc-titulo">Tu carrito</h2>
        <button type="button" class="cc-cerrar" aria-label="Cerrar carrito">&times;</button>
      </div>
      <div class="cc-cuerpo">
        <div class="cc-vista-carrito">
          <ul class="cc-items"></ul>
          <p class="cc-vacio" hidden>Tu carrito está vacío. Agrega un producto para empezar.</p>
          <div class="cc-resumen"></div>
        </div>
        <form class="cc-form" novalidate hidden>
          <h3>Datos de contacto</h3>
          <div class="cc-campo"><label for="cc-nombre">Nombre completo</label>
            <input id="cc-nombre" name="nombre" autocomplete="name" required minlength="5"></div>
          <div class="cc-campo"><label for="cc-email">Correo electrónico</label>
            <input id="cc-email" name="email" type="email" autocomplete="email" required></div>
          <div class="cc-campo"><label for="cc-celular">Celular</label>
            <input id="cc-celular" name="celular" type="tel" inputmode="numeric" autocomplete="tel-national"
              required pattern="3[0-9]{9}" placeholder="3001234567" title="10 dígitos, empieza por 3"></div>
          <div class="cc-dos-b">
            <div class="cc-campo"><label for="cc-tipo-doc">Documento</label>
              <select id="cc-tipo-doc" name="tipoDocumento" required>
                <option value="CC">CC</option><option value="CE">CE</option>
                <option value="NIT">NIT</option><option value="PP">Pasaporte</option>
              </select></div>
            <div class="cc-campo"><label for="cc-documento">Número</label>
              <input id="cc-documento" name="documento" inputmode="numeric" required pattern="[0-9A-Za-z]{5,15}"></div>
          </div>
          <h3>Dirección de envío</h3>
          <div class="cc-campo"><label for="cc-direccion">Dirección</label>
            <input id="cc-direccion" name="direccion" autocomplete="street-address" required minlength="6"
              placeholder="Calle 10 # 20-30, apto 401"></div>
          <div class="cc-dos">
            <div class="cc-campo"><label for="cc-ciudad">Ciudad o municipio</label>
              <input id="cc-ciudad" name="ciudad" autocomplete="address-level2" required></div>
            <div class="cc-campo"><label for="cc-depto">Departamento</label>
              <select id="cc-depto" name="departamento" required>
                <option value="">Elige uno</option>
                ${DEPARTAMENTOS.map(d => `<option>${d}</option>`).join('')}
              </select></div>
          </div>
          <div class="cc-campo"><label for="cc-notas">Indicaciones para la entrega (opcional)</label>
            <textarea id="cc-notas" name="notas" rows="2" maxlength="300"></textarea></div>
          <label class="cc-acepto">
            <input type="checkbox" name="acepto" required>
            <span>Acepto los <a href="${esc(CFG.urlTerminos)}" target="_blank" rel="noopener">términos y condiciones</a>
            y autorizo el tratamiento de mis datos según la <a href="${esc(CFG.urlPrivacidad)}" target="_blank" rel="noopener">política de privacidad</a>.</span>
          </label>
          <div class="cc-resumen cc-resumen-form"></div>
        </form>
      </div>
      <div class="cc-pie">
        <p class="cc-mensaje" role="status" aria-live="polite"></p>
        <button type="button" class="cc-btn cc-continuar">Continuar con el pago</button>
        <button type="button" class="cc-btn cc-btn-sec cc-volver" hidden>Volver al carrito</button>
        <p class="cc-medios">Paga con PSE, tarjeta o Nequi a través de Wompi.</p>
      </div>`;

    document.body.append(abrirBtn, velo, panel);

    Object.assign(ui, {
      abrirBtn, velo, panel,
      contador: abrirBtn.querySelector('.cc-contador'),
      items: panel.querySelector('.cc-items'),
      vacio: panel.querySelector('.cc-vacio'),
      vistaCarrito: panel.querySelector('.cc-vista-carrito'),
      resumenes: panel.querySelectorAll('.cc-resumen'),
      form: panel.querySelector('.cc-form'),
      continuar: panel.querySelector('.cc-continuar'),
      volver: panel.querySelector('.cc-volver'),
      mensaje: panel.querySelector('.cc-mensaje'),
      titulo: panel.querySelector('#cc-titulo')
    });

    abrirBtn.addEventListener('click', abrir);
    velo.addEventListener('click', cerrar);
    panel.querySelector('.cc-cerrar').addEventListener('click', cerrar);
    ui.continuar.addEventListener('click', () => (paso === 'carrito' ? irA('datos') : ui.form.requestSubmit()));
    ui.volver.addEventListener('click', () => irA('carrito'));
    ui.form.addEventListener('submit', pagar);

    ui.items.addEventListener('click', e => {
      const btn = e.target.closest('button[data-accion]');
      if (!btn) return;
      const id = btn.dataset.id;
      const actual = carrito[id] || 0;
      if (btn.dataset.accion === 'mas') cambiar(id, actual + 1);
      if (btn.dataset.accion === 'menos') cambiar(id, actual - 1);
      if (btn.dataset.accion === 'quitar') cambiar(id, 0);
    });

    document.addEventListener('keydown', e => {
      if (ui.panel.hidden) return;
      if (e.key === 'Escape') cerrar();
      if (e.key === 'Tab') atraparFoco(e);
    });

    // Cualquier botón con data-agregar="id" de tu página agrega ese producto.
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-agregar]');
      if (!btn) return;
      agregar(btn.dataset.agregar);
      confirmarBoton(btn);
    });
  }

  function confirmarBoton(btn) {
    if (btn.dataset.textoOriginal) return;
    btn.dataset.textoOriginal = btn.textContent;
    btn.textContent = 'Agregado';
    setTimeout(() => { btn.textContent = btn.dataset.textoOriginal; delete btn.dataset.textoOriginal; }, 1400);
  }

  function atraparFoco(e) {
    const focables = [...ui.panel.querySelectorAll('button, a[href], input, select, textarea')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focables.length) return;
    const primero = focables[0], ultimo = focables[focables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  function abrir() {
    // Al abrir, siempre se muestra primero el carrito (los datos ya escritos se conservan).
    paso = 'carrito';
    mensaje('');
    actualizar();
    ultimoFoco = document.activeElement;
    ui.velo.hidden = false;
    ui.panel.hidden = false;
    requestAnimationFrame(() => ui.panel.classList.remove('cc-oculto'));
    document.documentElement.style.overflow = 'hidden';
    ui.panel.querySelector('.cc-cerrar').focus();
  }
  function cerrar() {
    ui.panel.classList.add('cc-oculto');
    ui.velo.hidden = true;
    document.documentElement.style.overflow = '';
    const ocultar = () => { ui.panel.hidden = true; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ocultar();
    else setTimeout(ocultar, 280);
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  function irA(nuevoPaso) {
    if (nuevoPaso === 'datos' && cantidadTotal() === 0) return;
    paso = nuevoPaso;
    mensaje('');
    actualizar();
    const destino = paso === 'datos' ? ui.form.querySelector('input') : ui.titulo;
    if (destino) destino.focus({ preventScroll: false });
  }

  function mensaje(texto, tipo) {
    ui.mensaje.textContent = texto;
    ui.mensaje.className = 'cc-mensaje' + (tipo === 'error' ? ' cc-es-error' : tipo === 'exito' ? ' cc-es-exito' : '');
  }

  function actualizar() {
    // Quita del carrito productos que ya no existen, no están activos o se agotaron.
    for (const id of Object.keys(carrito)) {
      if (!porId.has(id) || esAgotado(porId.get(id)) || !(carrito[id] > 0)) delete carrito[id];
    }

    const n = cantidadTotal();
    ui.contador.textContent = n;
    ui.contador.hidden = n === 0;
    ui.abrirBtn.setAttribute('aria-label', n ? `Abrir carrito, ${n} ${n === 1 ? 'producto' : 'productos'}` : 'Abrir carrito');

    if (n === 0) paso = 'carrito';
    const enDatos = paso === 'datos';
    ui.vistaCarrito.hidden = enDatos;
    ui.form.hidden = !enDatos;
    ui.volver.hidden = !enDatos;
    ui.titulo.textContent = enDatos ? 'Datos de envío' : 'Tu carrito';

    ui.items.innerHTML = Object.entries(carrito).map(([id, cant]) => {
      const p = porId.get(id);
      return `
        <li class="cc-item">
          <img src="${esc(p.imagen || '')}" alt="" loading="lazy">
          <div>
            <p class="cc-item-nombre">${esc(p.nombre)}</p>
            <p class="cc-item-unitario">${cop.format(p.precio)} c/u</p>
            <span class="cc-cantidad">
              <button type="button" data-accion="menos" data-id="${esc(id)}" aria-label="Quitar una unidad de ${esc(p.nombre)}">&minus;</button>
              <span aria-label="Cantidad">${cant}</span>
              <button type="button" data-accion="mas" data-id="${esc(id)}" aria-label="Agregar una unidad de ${esc(p.nombre)}"
                ${cant >= CFG.maxPorProducto ? 'disabled' : ''}>+</button>
            </span>
            <button type="button" class="cc-quitar" data-accion="quitar" data-id="${esc(id)}">Quitar</button>
          </div>
          <div class="cc-item-total">${cop.format(p.precio * cant)}</div>
        </li>`;
    }).join('');
    ui.vacio.hidden = n > 0;

    const t = totales();
    let nota = '';
    if (n > 0 && t.gratisDesde && t.subtotal < t.gratisDesde) {
      nota = `<p class="cc-nota">Te faltan ${cop.format(t.gratisDesde - t.subtotal)} para el envío gratis.</p>`;
    }
    const resumen = n === 0 ? '' : `
      <div class="cc-fila"><span>Subtotal</span><span>${cop.format(t.subtotal)}</span></div>
      <div class="cc-fila"><span>Envío</span><span>${t.envioPendiente ? 'Por confirmar' : t.envio === 0 ? 'Gratis' : cop.format(t.envio)}</span></div>
      ${t.envioPendiente ? `<p class="cc-aviso-envio">${esc(CFG.mensajeEnvioEspecial)}</p>` : ''}
      <div class="cc-fila cc-fila-total"><span>Total</span><span>${cop.format(t.total)}</span></div>${nota}`;
    ui.resumenes.forEach(r => { r.innerHTML = resumen; });

    ui.continuar.disabled = n === 0;
    ui.continuar.textContent = enDatos ? `Pagar ${cop.format(t.total)}` : 'Continuar con el pago';
  }

  // Mensajes opcionales junto al precio, siempre en este orden: neutro, rojo, naranja.
  // Si el producto no tiene el campo o está vacío, no se muestra nada.
  const ETIQUETAS = [
    ['neutral-message', 'cc-etiqueta-neutra'],
    ['red-message', 'cc-etiqueta-roja'],
    ['orange-message', 'cc-etiqueta-naranja']
  ];
  function etiquetas(p) {
    return ETIQUETAS
      .filter(([campo]) => typeof p[campo] === 'string' && p[campo].trim() !== '')
      .map(([campo, clase]) => `<span class="cc-etiqueta ${clase}">${esc(p[campo].trim())}</span>`)
      .join('');
  }

  // Franja sobre el 30% inferior de la imagen. Si está agotado, se muestra
  // "Agotado" en rojo (tiene prioridad sobre la franja amarilla).
  function franja(p) {
    if (esAgotado(p)) return '<div class="cc-franja cc-franja-roja">Agotado</div>';
    const texto = typeof p['yellow-banner'] === 'string' ? p['yellow-banner'].trim() : '';
    return texto ? `<div class="cc-franja cc-franja-amarilla">${esc(texto)}</div>` : '';
  }

  function tarjeta(p) {
    return `
      <article class="cc-producto${esAgotado(p) ? ' cc-agotado' : ''}">
        <div class="cc-imagen">
          <img src="${esc(p.imagen || '')}" alt="${esc(p.nombre)}" loading="lazy">${franja(p)}
        </div>
        <h3>${esc(p.nombre)}</h3>
        ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
        <div class="cc-precio-fila">
          <span class="cc-precio">${cop.format(p.precio)}</span>${etiquetas(p)}
        </div>
        <button type="button" class="cc-btn" data-agregar="${esc(p.id)}"${esAgotado(p) ? ' disabled' : ''}>Agregar al carrito</button>
      </article>`;
  }

  // Convierte "Material de laboratorio" en "material-de-laboratorio" para los enlaces.
  function slug(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'otros';
  }

  // Agrupa los productos por su campo "category". El orden de las secciones es el de
  // la lista "categorias" del JSON (si existe) y luego el orden en que aparecen.
  // Los productos sin categoría van al final, en "Otros".
  function agrupar() {
    const grupos = new Map();
    (catalogo.categorias || []).forEach(c => { if (typeof c === 'string' && c.trim()) grupos.set(c.trim(), []); });
    for (const p of catalogo.productos) {
      const cat = typeof p.category === 'string' && p.category.trim() ? p.category.trim() : 'Otros';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push(p);
    }
    if (grupos.has('Otros')) { const otros = grupos.get('Otros'); grupos.delete('Otros'); grupos.set('Otros', otros); }
    return [...grupos].filter(([, productos]) => productos.length > 0);
  }

  function renderProductos() {
    const contenedor = document.getElementById('tienda-productos');
    if (!contenedor) return;
    const grupos = agrupar();
    const nav = grupos.length > 1 ? `
      <nav class="cc-categorias" aria-label="Categorías">
        ${grupos.map(([cat]) => `<a href="#cat-${slug(cat)}">${esc(cat)}</a>`).join('')}
      </nav>` : '';
    contenedor.innerHTML = nav + grupos.map(([cat, productos]) => `
      <section class="cc-seccion" id="cat-${slug(cat)}" aria-labelledby="titulo-${slug(cat)}">
        <h2 id="titulo-${slug(cat)}">${esc(cat)}</h2>
        <div class="cc-grilla">${productos.map(tarjeta).join('')}</div>
      </section>`).join('');
  }

  // ---------- Pago ----------
  function cargarWidget() {
    if (window.WidgetCheckout) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = WIDGET_URL;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Wompi. Revisa tu conexión e inténtalo de nuevo.'));
      document.head.appendChild(s);
    });
  }

  // Quita la marca roja en cuanto el campo queda bien.
  document.addEventListener('input', quitarError, true);
  document.addEventListener('change', quitarError, true);
  function quitarError(e) {
    const caja = e.target.closest && e.target.closest('.cc-con-error');
    if (caja && e.target.checkValidity()) caja.classList.remove('cc-con-error');
  }

  async function pagar(e) {
    e.preventDefault();
    if (!ui.form.checkValidity()) {
      // Marca en rojo cada campo con problema y dice cuáles son.
      const malos = [...ui.form.querySelectorAll(':invalid')];
      ui.form.querySelectorAll('.cc-con-error').forEach(el => el.classList.remove('cc-con-error'));
      const nombres = malos.map(el => {
        const caja = el.closest('.cc-campo, .cc-acepto');
        if (caja) caja.classList.add('cc-con-error');
        if (el.type === 'checkbox') return 'aceptar los términos';
        const lab = ui.form.querySelector(`label[for="${el.id}"]`);
        return lab ? lab.textContent.trim().toLowerCase() : el.name;
      });
      malos[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      malos[0].focus({ preventScroll: true });
      mensaje('Revisa: ' + [...new Set(nombres)].join(', ') + '.', 'error');
      return;
    }
    if (!CFG.workerUrl) {
      mensaje('Los pagos aún no están configurados en esta tienda.', 'error');
      return;
    }

    const f = new FormData(ui.form);
    const cliente = {
      nombre: f.get('nombre').trim(),
      email: f.get('email').trim(),
      celular: f.get('celular').trim(),
      tipoDocumento: f.get('tipoDocumento'),
      documento: f.get('documento').trim(),
      direccion: f.get('direccion').trim(),
      ciudad: f.get('ciudad').trim(),
      departamento: f.get('departamento'),
      notas: (f.get('notas') || '').trim()
    };
    const items = Object.entries(carrito).map(([id, cantidad]) => ({ id, cantidad }));

    ui.continuar.disabled = true;
    mensaje('Preparando tu pago…');

    try {
      const resp = await fetch(CFG.workerUrl.replace(/\/$/, '') + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, cliente })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'No se pudo iniciar el pago. Inténtalo de nuevo en unos minutos.');

      await cargarWidget();

      const checkout = new window.WidgetCheckout({
        currency: data.currency,
        amountInCents: data.amountInCents,
        reference: data.reference,
        publicKey: data.publicKey,
        signature: { integrity: data.signature },
        redirectUrl: CFG.urlGracias,
        customerData: {
          email: cliente.email,
          fullName: cliente.nombre,
          phoneNumber: cliente.celular,
          phoneNumberPrefix: '+57',
          legalId: cliente.documento,
          legalIdType: cliente.tipoDocumento
        },
        shippingAddress: {
          addressLine1: cliente.direccion,
          city: cliente.ciudad,
          region: cliente.departamento,
          country: 'CO',
          phoneNumber: cliente.celular,
          name: cliente.nombre
        }
      });

      mensaje('');
      // Cierra el panel del carrito antes de abrir Wompi: el panel bloquea el scroll de la página
      // y eso impedía desplazarse dentro de la ventana de pago en celulares.
      cerrar();
      checkout.open(resultado => {
        abrir();   // al cerrar Wompi, vuelve a mostrar el carrito con el resultado
        manejarResultado(resultado && resultado.transaction);
      });
    } catch (err) {
      mensaje(err.message, 'error');
    } finally {
      ui.continuar.disabled = cantidadTotal() === 0;
    }
  }

  // El resultado del widget sirve para avisar al cliente. La confirmación
  // definitiva del pago la hace el Worker con el webhook de Wompi.
  function manejarResultado(t) {
    if (!t) return; // el cliente cerró el widget
    if (t.status === 'APPROVED') {
      vaciar();
      mensaje(`Pago aprobado. Tu número de pedido es ${t.reference}. Te enviaremos la confirmación por correo.`, 'exito');
    } else if (t.status === 'PENDING') {
      vaciar();
      mensaje(`Tu pago está en proceso. Pedido ${t.reference}. Te avisaremos por correo cuando se confirme.`, 'exito');
    } else {
      mensaje('El pago no se completó. Tu carrito sigue guardado; puedes intentarlo de nuevo o usar otro medio de pago.', 'error');
    }
  }

  // ---------- Inicio ----------
  async function iniciar() {
    crearInterfaz();
    try {
      const resp = await fetch(CFG.catalogoUrl, { cache: 'no-cache' });
      if (!resp.ok) throw new Error();
      const datos = await resp.json();
      catalogo = {
        envio: datos.envio || { costo: 0, gratisDesde: null },
        categorias: Array.isArray(datos.categorias) ? datos.categorias : [],
        productos: (datos.productos || []).filter(p => p.activo !== false)
      };
      catalogo.productos.forEach(p => porId.set(p.id, p));
    } catch (e) {
      console.error('No se pudo cargar el catálogo:', CFG.catalogoUrl);
    }
    renderProductos();
    actualizar();
    guardar();
  }

  window.Carrito = { agregar: id => agregar(id), abrir: () => abrir(), vaciar };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
