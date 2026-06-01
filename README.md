# WhatsApp Notification API

API REST que envía mensajes de WhatsApp automáticamente cuando se realiza una compra. Al recibir una petición, notifica al cliente con un mensaje personalizado y al dueño del negocio con una alerta interna — todo a través de WhatsApp Web usando [Baileys](https://github.com/WhiskeySockets/Baileys).

---

## Tecnologías

| Herramienta | Rol |
|---|---|
| **Node.js + TypeScript** | Runtime y lenguaje |
| **tsx** | Ejecutor de TypeScript sin compilación previa |
| **Express 5** | Servidor HTTP |
| **Baileys** | Cliente de WhatsApp Web (WebSocket) |
| **pino** | Logger |
| **PM2** | Gestor de procesos en producción |
| **Nginx** | Reverse proxy |

---

## Requisitos previos

- Node.js **v20.6 o superior** (se usa el flag `--env-file` nativo)
- pnpm **v8 o superior**
- Una cuenta de WhatsApp activa para vincular como bot
- (Producción) Ubuntu VPS con PM2 y Nginx instalados

---

## Configuración local (desarrollo)

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Crear el archivo de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales (ver sección [Variables de entorno](#variables-de-entorno)).

### 3. Arrancar el servidor

```bash
pnpm start
```

La primera vez (o si borraste la sesión) aparecerá un código QR en la terminal. Escanéalo desde WhatsApp en tu teléfono: **Ajustes → Dispositivos vinculados → Vincular un dispositivo**.

Una vez escaneado verás:

```
✅ WhatsApp conectado.
```

La sesión queda guardada en la carpeta `auth_info_baileys/` para futuras ejecuciones.

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `API_KEY` | Sí | Clave secreta para autenticar requests. Se envía en el header `x-api-key`. |
| `OWNER_PHONE` | Sí | Tu número de teléfono en formato E.164 sin `+` (ej: `593987654321`). Recibirá las alertas internas. |
| `PORT` | No | Puerto del servidor Express. Por defecto: `3001`. |

> El servidor se niega a arrancar si `API_KEY` no está definida.

---

## Endpoints de la API

### `GET /api/status` — Estado de la conexión

No requiere autenticación. Útil para health checks de PM2, Nginx o sistemas de monitoreo.

**Request:**
```http
GET /api/status
```

**Respuesta exitosa `200`:**
```json
{
  "status": "connected",
  "uptime": 3621.5
}
```

**Valores posibles de `status`:**

| Valor | Significado |
|---|---|
| `connecting` | El servidor arrancó pero WhatsApp aún no estableció conexión |
| `connected` | WhatsApp conectado y listo para enviar mensajes |
| `disconnected` | La conexión se cerró (reconectando automáticamente) |

---

### `POST /api/purchase` — Notificación de compra

Envía dos mensajes de WhatsApp simultáneamente: uno al cliente y uno al dueño.

**Requiere autenticación:** header `x-api-key: <tu-API_KEY>`

**Request:**
```http
POST /api/purchase
Content-Type: application/json
x-api-key: tu-clave-secreta
```

**Body JSON:**
```json
{
  "clientPhone": "593987654321",
  "clientMessage": "¡Gracias por tu compra! Tu pedido #1042 fue confirmado y está siendo procesado.",
  "internalAlert": "Cliente: Juan Pérez\nProducto: Plan Pro - 1 mes\nMonto: $49.00\nMétodo de pago: Tarjeta"
}
```

**Campos del body:**

| Campo | Tipo | Descripción |
|---|---|---|
| `clientPhone` | `string` | Teléfono del cliente en formato E.164 sin `+`. Solo dígitos, 7–15 caracteres. |
| `clientMessage` | `string` | Mensaje que recibirá el cliente en WhatsApp. |
| `internalAlert` | `string` | Texto del aviso interno. El dueño lo recibirá con el prefijo `🔔 NUEVA COMPRA:`. |

**Respuesta exitosa `200`:**
```json
{
  "success": true,
  "message": "Notificaciones enviadas"
}
```

**Respuestas de error:**

| Código | Causa | Ejemplo de respuesta |
|---|---|---|
| `400` | Falta un campo requerido | `{"error": "Faltan campos requeridos: clientPhone, clientMessage, internalAlert"}` |
| `400` | Formato de teléfono inválido | `{"error": "clientPhone inválido. Usa solo dígitos con código de país (ej: 593987654321)"}` |
| `401` | API key incorrecta o ausente | `{"error": "No autorizado"}` |
| `500` | Error interno al enviar el mensaje | `{"error": "...mensaje del error de Baileys..."}` |
| `503` | WhatsApp no está conectado aún | `{"error": "WhatsApp no está disponible (estado: connecting)"}` |

---

### `POST /api/reservation` — Alias retrocompatible

Idéntico a `POST /api/purchase`. Acepta el mismo body y devuelve la misma respuesta. Existe para no romper integraciones que usaban el nombre anterior del endpoint.

---

## Despliegue en VPS (Ubuntu)

Esta guía configura la API en un puerto interno aislado (`3001`) con Nginx como reverse proxy, sin afectar otros proyectos en el servidor.

### Paso 1 — Conectarse al VPS

```bash
ssh usuario@ip-del-vps
```

### Paso 2 — Instalar Node.js (si no está instalado)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # debe ser >= 20.6
```

### Paso 3 — Instalar pnpm y PM2

```bash
npm install -g pnpm pm2
```

### Paso 4 — Subir el proyecto al VPS

**Opción A — desde Git:**
```bash
git clone https://github.com/tu-usuario/tu-repo.git /var/www/whatsapp-api
cd /var/www/whatsapp-api
```

**Opción B — con scp desde tu máquina local (excluye node_modules y sesión):**
```bash
# Ejecutar en tu máquina local:
scp -r . usuario@ip-del-vps:/var/www/whatsapp-api \
  --exclude=node_modules \
  --exclude=auth_info_baileys \
  --exclude=.env \
  --exclude=logs
```

### Paso 5 — Instalar dependencias en el VPS

```bash
cd /var/www/whatsapp-api
pnpm install
mkdir -p logs
```

### Paso 6 — Configurar las variables de entorno para PM2

Edita `ecosystem.config.cjs` y reemplaza los valores del bloque `env`:

```bash
nano ecosystem.config.cjs
```

```js
env: {
  NODE_ENV: 'production',
  PORT: '3001',
  API_KEY: 'pon-aqui-una-clave-larga-y-segura',   // ← cambiar
  OWNER_PHONE: '593987654321',                     // ← tu número real
},
```

> Guarda con `Ctrl+O`, sal con `Ctrl+X`.

### Paso 7 — Iniciar con PM2

```bash
pm2 start ecosystem.config.cjs
```

### Paso 8 — Escanear el código QR

```bash
pm2 logs whatsapp-api
```

Verás el QR en la terminal. Escanéalo con WhatsApp: **Ajustes → Dispositivos vinculados → Vincular un dispositivo**.

Una vez escaneado aparecerá `✅ WhatsApp conectado.` Sal de los logs con `Ctrl+C`.

### Paso 9 — Guardar la configuración de PM2 y activar el autoarranque

```bash
pm2 save
pm2 startup
```

El segundo comando imprime un comando `sudo ...` que debes copiar y ejecutar para que PM2 arranque automáticamente al reiniciar el servidor.

### Paso 10 — Configurar Nginx como reverse proxy

Crea un nuevo archivo de configuración para este proyecto. Usa un subdominio dedicado para mantenerlo aislado del resto.

```bash
sudo nano /etc/nginx/sites-available/whatsapp-api
```

Pega la siguiente configuración (reemplaza `api.tu-dominio.com` con tu subdominio real):

```nginx
server {
    listen 80;
    server_name api.tu-dominio.com;

    # Logs aislados para este proyecto
    access_log /var/log/nginx/whatsapp-api.access.log;
    error_log  /var/log/nginx/whatsapp-api.error.log;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

Activa el sitio y recarga Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-api /etc/nginx/sites-enabled/
sudo nginx -t          # verifica que no hay errores de sintaxis
sudo systemctl reload nginx
```

### Paso 11 — (Recomendado) Habilitar HTTPS con Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.tu-dominio.com
```

Certbot actualiza la configuración de Nginx automáticamente para servir en `https://`.

---

## Gestión del proceso con PM2

| Comando | Acción |
|---|---|
| `pm2 status` | Ver estado de todos los procesos |
| `pm2 logs whatsapp-api` | Ver logs en tiempo real |
| `pm2 restart whatsapp-api` | Reiniciar el proceso |
| `pm2 stop whatsapp-api` | Detener el proceso |
| `pm2 delete whatsapp-api` | Eliminar el proceso de PM2 |

---

## Reconectar WhatsApp (nueva sesión)

Si la sesión de WhatsApp se cierra permanentemente (logout manual desde el teléfono), debes reiniciar el proceso desde cero:

```bash
# En el VPS:
pm2 stop whatsapp-api
rm -rf /var/www/whatsapp-api/auth_info_baileys
pm2 start whatsapp-api
pm2 logs whatsapp-api   # escanea el nuevo QR que aparece
```

---

## Estructura del proyecto

```
.
├── index.ts                  # Código fuente principal
├── ecosystem.config.cjs      # Configuración de PM2
├── package.json
├── tsconfig.json
├── .env                      # Variables de entorno locales (no subir a Git)
├── .env.example              # Plantilla de variables de entorno
├── auth_info_baileys/        # Sesión de WhatsApp (generada automáticamente, no subir a Git)
└── logs/                     # Logs de PM2 (generada automáticamente)
```

> Asegúrate de que `.env` y `auth_info_baileys/` estén en tu `.gitignore`.
