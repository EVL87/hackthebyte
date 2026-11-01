# Hack the Byte 🛡️

Blog técnico y portal de investigación en ciberseguridad, Red Team, evasión de controles perimetrales y análisis defensivo en SOC.

## 🚀 Arquitectura "La Opción Hacker"
- **Generador Estático (SSG):** [Astro](https://astro.build)
- **Alojamiento & Edge CDN:** [Cloudflare Pages](https://pages.cloudflare.com)
- **Superficie de ataque:** 0% (Sin bases de datos SQL, sin PHP, sin paneles vulnerables)
- **Costo de infraestructura:** $0 USD / mes

## 🛠️ Comandos locales

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo en http://localhost:4321
npm run dev

# Compilar producción en ./dist
npm run build

# Previsualizar compilación
npm run preview
```

## ✍️ Publicar un nuevo artículo
Para publicar una nueva investigación:
1. Crea un archivo Markdown en `src/content/blog/mi-articulo.md`.
2. Coloca las capturas o diagramas en `public/images/`.
3. Haz un commit y push a `main`:
   ```bash
   git add .
   git commit -m "feat: nuevo writeup"
   git push origin main
   ```
4. Cloudflare Pages o GitHub Actions compila y despliega en menos de 20 segundos automáticamente a nivel global.
