// =======================================================
// Archivo: server.js (Ordenamiento por Popularidad)
// =======================================================

const express = require('express');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const pool = require('./db');
const syncDiscountedGames = require('./sync');

const app = express();
app.use(express.json());

// Permitir peticiones CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /api/games
 * Filtros por query parameters:
 *  - discount: '100', '95', '90', '80'
 *  - subcategory: slug de la subcategoría (ej: 'rpg', 'co-op')
 *  - search: búsqueda por título
 */
app.get('/api/games', async (req, res) => {
  const { discount, subcategory, search } = req.query;

  try {
    let query = `
      SELECT g.id, g.steam_app_id, g.title, g.type, g.normal_price, g.current_price, 
             g.discount_percent, g.cover_image, g.steam_url, g.deal_rating, g.steam_rating_count,
             ARRAY_AGG(s.name) FILTER (WHERE s.name IS NOT NULL) AS subcategories
      FROM games g
      LEFT JOIN game_subcategories gs ON g.id = gs.game_id
      LEFT JOIN subcategories s ON gs.subcategory_id = s.id
    `;

    const conditions = [];
    const params = [];

    // Filtro por descuento
    if (discount) {
      const discountVal = parseInt(discount);
      if (discountVal === 100) {
        conditions.push(`g.discount_percent = 100`);
      } else {
        params.push(discountVal);
        conditions.push(`g.discount_percent >= $${params.length}`);
      }
    }

    // Filtro por subcategoría
    if (subcategory) {
      params.push(subcategory.toLowerCase());
      conditions.push(`s.slug = $${params.length}`);
    }

    // Filtro por búsqueda de texto
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`g.title ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    // ORDENAMIENTO POR POPULARIDAD:
    // Prioriza mayor valoración de la oferta (deal_rating), más reseñas (steam_rating_count) y mayor porcentaje de descuento.
    query += ` GROUP BY g.id ORDER BY g.deal_rating DESC, g.steam_rating_count DESC, g.discount_percent DESC;`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener juegos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/subcategories
 */
app.get('/api/subcategories', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.name, s.slug, COUNT(gs.game_id) AS total_games
      FROM subcategories s
      JOIN game_subcategories gs ON s.id = gs.subcategory_id
      GROUP BY s.id
      ORDER BY total_games DESC, s.name ASC;
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener subcategorías:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Redirección por defecto a index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Programar la sincronización cada 6 horas
cron.schedule('0 */6 * * *', () => {
  console.log('⏰ Ejecutando sincronización programada por Cron Job...');
  syncDiscountedGames();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  syncDiscountedGames();
});