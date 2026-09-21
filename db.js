// =======================================================
// Archivo: db.js (Soporte para Entorno Local y Producción)
// =======================================================

const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Si existe DATABASE_URL (provista por Render u otro proveedor en la nube), se usa la URL directa.
// De lo contrario, toma las variables individuales para el entorno local.
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false
      }
    : {
        user: String(process.env.DB_USER || 'postgres'),
        host: String(process.env.DB_HOST || 'localhost'),
        database: String(process.env.DB_NAME || 'steam_deals_db'),
        password: String(process.env.DB_PASSWORD || ''),
        port: Number(process.env.DB_PORT) || 5432,
      }
);

pool.on('connect', () => {
  console.log('🔌 Conectado exitosamente a PostgreSQL.');
});

pool.on('error', (err) => {
  console.error('❌ Error en el cliente de PostgreSQL:', err);
});

module.exports = pool;