module.exports = {
  apps: [
    {
      name: 'whatsapp-api',
      script: 'node_modules/.bin/tsx',
      args: 'index.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        API_KEY: 'CAMBIA_ESTA_CLAVE',
        OWNER_PHONE: '593996222872',
      },
      // Reinicio automático si el proceso cae
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      // Logs
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
