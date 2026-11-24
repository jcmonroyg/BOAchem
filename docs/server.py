
import os
import http.server, threading, webbrowser
from functools import partial

carpeta = os.path.dirname(os.path.abspath(__file__))

handler = partial(http.server.SimpleHTTPRequestHandler, directory=carpeta)
servidor = http.server.ThreadingHTTPServer(("localhost", 8000), handler)
threading.Thread(target=servidor.serve_forever, daemon=True).start()

webbrowser.open("http://localhost:8000/tienda.html")

'El carrito contiene un ITEM cuyo envio no está incluido. Completa tu compra, un asesor se contactará contigo lo más pronto posible para concretar los detalles de envio, incluido su costo, el valor del envio puede ser pagado a contraentrega. Si prefieres estimar primero el valor del envio antes de continuar con esta compra, porsupuesto! Contáctanos, estamos bien pendientes.'
  