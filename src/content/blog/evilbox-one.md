---
title: "EvilBox: One – Writeup sin Metasploit (VulnHub)"
description: "Guía paso a paso para resolver la máquina EvilBox: One de VulnHub sin Metasploit: fuzzing web, explotación de LFI para extraer id_rsa y escalada a root."
pubDate: "2021-09-08"
author: "EVLBYTE"
tags: ["Escalada de Privilegios", "EvilBoxOne", "John The Ripper", "LFI", "OSCP PREP", "Sin Metasploit", "SSH Key Cracking", "VulnHub", "WriteUp"]
category: "Ciberseguridad"
heroImage: "/images/2021_09_image-1.png"
draft: false
---

Esta es una maquina bastante simple, el truco es hacer una buena enumeración, tanto de directorios y archivos. (http://www.vulnhub.com/entry/evilbox-one,736)

## 1. Reconocimiento y Escaneo de Red

![Imagen técnica](/images/2021_09_image-1.png)

## 2. Escaneo de Puertos y Servicios

![Imagen técnica](/images/2021_09_image-2.png)

Descubrimos que el servidor es un Linux Debian con openSSH y Apache 2.4.38, instalados, utilizando los puertos 22 Y 80.

### 2.1 Enumeración del Servicio Web (Puerto 80 HTTP)

Verificamos en el navegador la ip del servidor

![Imagen técnica](/images/2021_09_image-3.png)

Debemos por lo tanto hacer una enumeración de directorios y archivos

### 2.2 Fuzzing y Enumeración de Directorios Ocultos

![Imagen técnica](/images/2021_09_image-4.png)

Únicamente tenemos 2 entradas que nos pueden servir, el archivo robots.txt en la raíz y un directorio llamado secret, los cuales procederemos a examinar utilizando los siguiente comandos

![Imagen técnica](/images/2021_09_image-5.png)

Utilizaremos las herramienta FUZZ para realizar la enumeración de archivos dentro de la carpeta /secret

![Imagen técnica](/images/2021_09_image-6.png)

donde encontramos un archivo llamado "evil.php" el cual utilizaremos para validar con la herramienta FUZZ si el mismo tiene alguna variable de interés con la que podamos obtener información o acceso o podamos realizar un ataque Directory Traversal

## 3. Ganando Acceso Inicial vía SSH con Clave Privada

![Imagen técnica](/images/2021_09_image-7.png)

Dentro de este archivo php podemos encontrar que existe una variable llamada "command" que nos permite realizar un recorrido inverso hasta el directorio y archivo /etc/passwd lo cual nos indica que es posible leer su contenido ya que la respuesta es 200. Al ejecutarla con curl logramos obtener el contenido.

![Imagen técnica](/images/2021_09_image-8.png)

donde encontramos un usuario creado "mowree", el cual cuenta con una carpeta dentro del directorio home, lo que nos da la idea de buscar la llave rsa para conectarnos via ssh al servidor. por lo que ejecutamos nuevamente el archivo evil.php utilizando la variable command para intentar leer el archivo id_rsa que comúnmente esta en la ruta /.ssh/id_rsa dentro del directorio del usuario.

![Imagen técnica](/images/2021_09_image-9.png)

Eureka! encontramos nuestro acceso al servidor, por lo que guardaremos esta informacion en un archivo utilizando curl.

![Imagen técnica](/images/2021_09_image-10.png)

Ya que esta es una llave privada esta cifrada con un password el cual crackearemos con la aplicación RSAcrack (https://github.com/d4t4s3c/RSAcrack), utilizando la vieja confiable lista Rockyou.txt

![Imagen técnica](/images/2021_09_image-11.png)

ya teniendo la contraseña de nuestra clave de usuario rsa, procedemos a darle permisos de lectura y escritura al archivo de llave que utilizaremos para luego poder utilizarla en nuestra conexión ssh hacia el servidor, obteniendo el acceso necesario.

chmod 600 id_rsa

ssh -i id_rsa mowree@192.168.88.19

![Imagen técnica](/images/2021_09_image-12.png)

![Imagen técnica](/images/2021_09_image-13.png)

## 4. Escalada de Privilegios a Root (Validación con LES)

Utilizaremos el script LINUX SMART ENUMERATION para buscar localmente vulnerabilidades que podamos aprovechar para escalar privilegios a root. Para esto debemos descargar desde el repositorio de GitHub el script LES.sh,  (https://github.com/diego-treitos/linux-smart-enumeration). crearemos un directorio tmp para luego dejar poder borrar nuestro rastro y descargaremos la aplicación LES.sh dentro de el, la compilaremos y ejecutaremos.

![Imagen técnica](/images/2021_09_image-14.png)

y procedemos a ejecutar la herramienta lse.sh con level 1

constatamos que existen 2 usuarios tal como lo vimos en el archivo /etc/passwd, pero tambien encontramos las diferentes rutas de archivos que estan ruteadas

![Imagen técnica](/images/2021_09_image-15.png)

validando los permisos de escritura en archivos sensibles encontramos algo curioso, ya que tenemos acceso de escritura sobre el archivo /etc/passwd

![Imagen técnica](/images/2021_09_image-16.png)

![Imagen técnica](/images/2021_09_image-17.png)

por lo que procederemos de la manera simple, crearemos un password cifrado usando openssl y lo agregaremos en la configuración del usuario root dentro archivo /etc/passwd donde sustituiremos la letra x de la segunda columna.

![Imagen técnica](/images/2021_09_image-18.png)

![Imagen técnica](/images/2021_09_image-19.png)

Al realizar la edición del archivo /etc/passwd podremos cambiar de usuario (su root) utilizando la contraseña 123456

![Imagen técnica](/images/2021_09_image-20.png)

y eso es todo por esta maquina, podemos enumerar algunas cosas importantes que aprendimos durante el proceso de Own.

- Técnicas de enumeración de Directorios, archivos y variables vulnerables
- Craqueo de llaves RSA
- Utilización de la herramienta LSE para buscar vulnerabilidades que nos permita escalar privilegios.
