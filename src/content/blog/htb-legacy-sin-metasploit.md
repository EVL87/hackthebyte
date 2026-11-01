---
title: "HTB: Legacy – Writeup sin Metasploit (Explotación MS08-067)"
description: "Resolución paso a paso de la máquina Legacy de Hack The Box sin Metasploit: escaneo de SMB, explotación manual de MS08-067 y obtención de NT AUTHORITY\\SYSTEM."
pubDate: "2021-11-18"
author: "EVLBYTE"
tags: ["Buffer Overflow", "HackTheBox", "HTB Legacy", "MS08-067", "OSCP PREP", "Sin Metasploit", "SMB", "Windows XP", "WriteUp"]
category: "Ciberseguridad"
heroImage: "/images/2021_11_image-17.png"
draft: false
---

Esta es una maquina considerada como fácil, ideal para iniciar en el pentest. La máquina Legacy de HTB actualmente esta retirada por lo que para poder trabajarla es necesario contar con una suscripción VIP.

![Imagen técnica](/images/2021_11_image-17.png)

## 1. Preparación del Entorno y Reconocimiento

Iniciamos como siempre organizando nuestro ambiente de trabajo, por lo que crearemos los siguientes directorios: nmap, exploits, vuln y tmp.

He creado para automatizar un script en bash que nos permite crear automáticamente todas las carpetas que normalmente utilizo para las CTF de HTB.

```bash
directorios Legacy
```

continuamos entonces con el reconocimiento, de los puertos expuestos de la maquina Legacy de HTB con nuestro script básico pero efectivo. Ingresamos al directorio /home/usuario/Legacy/nmap y corremos el siguiente script de nmap:

```bash
nmap -sV -sC -p- -Pn --min-rate 10000 --open -vvv -n -oX puertos_expuestos.xml 10.10.10.4
```

luego convertiremos el archivo xml que acabamos de generar en un archivo html para poderlo visualizar, de una forma mas ordenada que nos servirá igualmente para los reportes posteriores.

```bash
sudo xsltproc puertos_expuestos.xml -o puertos_expuestos.html
```

![Imagen técnica](/images/2021_11_image-18.png)

Obtenemos como información principal 2 puertos abiertos, expuestos, además de información sobre el servicio y versión de cada uno.

Tenemos disponibles los puertos:

- 139 y 445 de SMB.

ademas obtenemos informacion sobre el sistema operativo, en este caso un Windows XP

![Imagen técnica](/images/2021_11_image-19.png)

## 2. Análisis de Vulnerabilidades SMB (MS08-067)

Podemos realizar un análisis con nmap para buscar vulnerabilidades sobre los puertos expuestos con el siguiente comando:

```bash
nmap -sV -sC -script smb-vuln* -T5 -p445 -vvv -Pn -T5 -oX vuln445.xml 10.10.10.4
```

![Imagen técnica](/images/2021_11_image-20.png)

Vemos que tenemos 2 vulnerabilidades MS17-010 Y MS08-067, buscamos en github si existe algun exploit para estas vulnerabilidades:

https://github.com/andyacer/ms08_067

![Imagen técnica](/images/2021_11_image-21.png)

## 3. Explotación Manual de MS08-067 sin Metasploit

Clonamos el repositorio y procedemos a revisar el exploit:

![Imagen técnica](/images/2021_11_image-22.png)

Basicamente logramos entender segun las anotaciones del desarrollador que el exploit es un ataque de buffer over flow que nos permite la inyeccion de codigo para ejecucion remota en el equipo victima, el mismo conciste sobre saturar el proceso a traves de la memoria controlando los bits de retorno para ejecutar instrucciones, necesitamos tener un numero bits definidos en el exploit, que para esta vulnerabilidad en concreto son 410 bits, por lo que este exploit esta diseñado para generar un payload no mayor a 380.

Este exploit esta escrito en python 2.7 por lo que requiere la instalacion de pip para la importacion de librerias de smb y tambien de la libreria pycrypto, pero debido a que python 2 ya no cuenta con soporte, la instalacion de pip para la version de python2 ya no esta disponible, por lo que me tome la tarea de realizar la version de python3, y se agrego la funcionalidad de que podamos utilizar cualquier payload y que el calculo de los bits null se realize automaticamente, en base a la resta de los bits necesarios y el tamaño del payload generado.

Basicamente nuestro payload genera un shell reversa hacia la maquina atacante, por lo que  para utilizar el exploit debemos colocar nuestro equipo en escucha sobre el puerto que elegimos al crear el payload, para este ejemplo utilizamos el puerto 443, en la documentacion de github se añade un script de ejemplo para generar el payload.

El exploit ya traducido a python3 lo pueden encontrar en github: https://github.com/EVL87/ms08_067

Para utilizarlo debemos generar primero una escucha sobre el puerto 443 en nuestro equipo.

```bash
netcat -lvnp 443
```

y corremos el exploit

```bash
python3 ms08-067_p3.py 10.10.10.4 6 445
```

![Imagen técnica](/images/2021_11_image-23.png)

## 4. Acceso con NT AUTHORITY\SYSTEM y Captura de Flags

Y obtenemos una conexión directamente del cliente Windows, en este caso con permisos de NT SYSTEM

![Imagen técnica](/images/2021_11_image-24.png)

unicamente nos queda ingresar a los directorios de usuarios y correr type y el nombre del archivo flag

![Imagen técnica](/images/2021_11_image-25.png)

![Imagen técnica](/images/2021_11_image-26.png)

## 5. Conclusiones y Aprendizajes

En esta ocasión podemos resumir que hemos aprendido sobre buffer over flow en windows, y de que muchas veces tendremos que adaptar los exploits a la situacion actual pues en este caso debido a que python 2 ya no cuenta con soporte, fue necesario realizar la adaptacion del exploit a python3. Esta maquina no fue tan dificil pero si trabajosa al tener que actualizar el exploit a una nueva version.

Saludos y nos leemos en una proxima ocasión.
