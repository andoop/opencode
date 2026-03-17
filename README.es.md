<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Plataforma web interna de colaboración en I+D de IA basada en OpenCode.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

## Posicionamiento del proyecto

Este repositorio no describe una herramienta genérica de codificación con IA de escritorio, sino una plataforma web interna de I+D de IA personalizada a partir de OpenCode.

- Es un producto interno **Web-first**; el foco actual de personalización es la aplicación web
- Sirve para la **colaboración multiusuario** en la organización, no para uso local de un solo desarrollador
- No permite conectar libremente a directorios del servidor; los usuarios trabajan dentro de **límites de proyecto controlados por el administrador**
- Ofrece **capacidades de plataforma de IA unificada**, no solo una página de "chatear con IA para editar código"

Puedes entenderlo como:

> Un banco de trabajo de I+D de IA controlado, gobernable y multiusuario para uso interno.

## Nuestra filosofía

La plataforma aspira a ser una plataforma interna unificada de colaboración en I+D de IA, no solo una página de codificación con IA.

Principios clave:

- **No es un escritorio remoto, sino un banco de trabajo de IA dentro de proyectos controlados**
- **No para que pocos desarrolladores monopolicen la IA, sino para que más roles participen en la producción de software dentro de su ámbito autorizado**
- **No que la IA solo responda preguntas, sino que la IA se convierta gradualmente en la capa de ejecución del flujo de I+D**
- **No eliminar límites, sino mejorar la eficiencia bajo gobernanza de permisos, proyectos, sesiones y modelos**

En términos de producto, los tres límites más importantes son:

- **Límite de proyecto**: los usuarios normales solo pueden acceder a proyectos preregistrados por administradores
- **Límite de sesión**: una tarea corresponde a una sesión y un espacio de trabajo independientes
- **Límite de permisos**: qué ven los usuarios, qué pueden hacer y qué modelos pueden usar lo controla la plataforma

## Capacidades actuales clave

La personalización se centra en la aplicación web:

- Registro multiusuario, inicio de sesión y gestión de cuentas
- Capacidades de usuario, proyecto, modelo y auditoría visibles para administradores
- Registro de proyectos para exponer solo repositorios de código aprobados
- Espacios de trabajo aislados por sesión, típicamente mediante Git worktrees
- Gobernanza unificada de modelos, proveedores, permisos y modos
- Punto de entrada unificado a la plataforma de IA para equipos

El foco no está en escritorio ni TUI, sino en:

> Permitir que los usuarios internos completen preguntas y respuestas, análisis, edición, ejecución y colaboración vía web, dentro de proyectos controlados.

## Multiusuario y plataforma de IA unificada

La plataforma no concede acceso total a quien inicia sesión. En su lugar:

1. Los administradores preparan el código del proyecto en el servidor
2. Los administradores registran los directorios permitidos como proyectos
3. Los usuarios se registran e inician sesión vía web
4. Los usuarios normales solo ven los proyectos que se les han abierto
5. Los usuarios comienzan a trabajar en sesiones tras entrar en un proyecto

La plataforma de IA unificada ofrece:

- Punto de entrada unificado de modelos
- Gestión unificada de proveedores
- Control unificado de permisos
- Flujo de trabajo unificado por sesión
- Límites unificados de auditoría y gobernanza

Este diseño permite un despliegue interno gradual: empezar con permisos de bajo riesgo y ampliar por rol y escenario.

## Soporte de Cursor CLI

La plataforma admite **Cursor CLI** como fuente de modelo/proveedor en la plataforma de IA unificada.

### Cómo conectar

La máquina del servidor debe tener Cursor CLI instalado y el comando `agent` disponible en la shell:

```bash
agent login
```

Tras el inicio de sesión, la plataforma reutiliza el estado de login local de Cursor.

### Uso en la plataforma

- Los administradores controlan si los usuarios pueden acceder a modelos y proveedores
- Los usuarios restringidos por defecto suelen tener solo el modo `ask`
- La lista blanca de modelos por defecto suele incluir:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Si Cursor CLI no está instalado o `agent` no está disponible, los modelos y proveedores de Cursor CLI no aparecerán en la plataforma.

### Recomendaciones de configuración

Para el despliegue interno inicial:

- Usuarios restringidos por defecto: solo modo `ask`
- Lista blanca de modelos por defecto: preferir modelos `cursor-cli`
- No exponer Provider, Server, MCP u otra gestión de alto riesgo por defecto
- Que los administradores amplíen capacidades por usuario o rol según sea necesario

Beneficios:

- Bajo coste de incorporación
- Límites de riesgo claros
- Fuente de modelos unificada
- UX sencilla para adopción interna

### Rol en el sistema

Con Cursor CLI conectado, la plataforma no solo llama a una API de modelo externa. Organiza el contexto de sesión, los límites del proyecto y las herramientas de la plataforma, y los pasa a Cursor CLI para su ejecución.

Así, `cursor-cli` no es una herramienta aislada aquí, sino parte de la plataforma de IA unificada.

## Recomendaciones de despliegue para administradores

Enfoque recomendado:

1. Preparar directorios de proyecto controlados
2. Registrar solo repositorios explícitamente aprobados
3. Dar permisos restringidos por defecto a usuarios normales
4. Priorizar Q&A web y capacidades de bajo riesgo
5. Añadir gradualmente más modelos, modos y funciones de flujo de trabajo

En resumen: no activar todo de golpe. En su lugar:

> Establecer primero los límites de proyecto, permisos, modelos y sesiones, y luego ampliar las capacidades de la plataforma paso a paso.

## Desarrollo local

La personalización se centra en la aplicación web, por lo que el desarrollo local debe arrancar el stack web.

Instalar dependencias:

```bash
bun install
```

Arranque con un comando:

```bash
sh restart-services.sh
```

URLs por defecto:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

Para arrancar por separado:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Documentación relacionada

- `docs/internal-web-user-manual.md`
  - Guía de usuario para administradores y usuarios normales
- `docs/internal-ai-platform-vision.md`
  - Visión de producto y dirección futura para el equipo

Estos documentos son más detallados y más cercanos a los objetivos reales de este producto personalizado.

---

**Foco actual**: aplicación web, multiusuario, plataforma de IA unificada, colaboración en proyectos controlados.
