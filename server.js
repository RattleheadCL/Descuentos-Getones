// =======================================================
// Archivo: server.js (Filtros por nuevos rangos de descuento)
// =======================================================

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const pool = require('./db');
const syncDiscountedGames = require('./sync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint: Obtener juegos filtrados por los nuevos rangos de descuento
app.get('/api/games', async (req, res) => {
  try {
    const { discount, subcategory, search } = req.query;

    let query = `
      SELECT 
        g.id, g.steam_app_id, g.title, g.normal_price, g.current_price, 
        g.discount_percent, g.cover_image, g.steam_url, g.deal_rating, g.steam_rating_count,
        ARRAY_AGG(s.name) AS subcategories
      FROM games g
      LEFT JOIN game_subcategories gs ON g.id = gs.game_id
      LEFT JOIN subcategories s ON gs.subcategory_id = s.id
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    // Aplicar filtrado por los nuevos rangos requeridos
    if (discount) {
      const discountType = parseInt(discount, 10);
      if (discountType === 100) {
        query += ` AND g.discount_percent = 100`;
      } else if (discountType === 76) {
        query += ` AND g.discount_percent BETWEEN 76 AND 99`;
      } else if (discountType === 51) {
        query += ` AND g.discount_percent BETWEEN 51 AND 75`;
      } else if (discountType === 50) {
        query += ` AND g.discount_percent BETWEEN 1 AND 50`;
      } else if (!isNaN(discountType)) {
        query += ` AND g.discount_percent >= $${paramIndex++}`;
        values.push(discountType);
      }
    }

    if (subcategory) {
      query += ` AND g.id IN (
        SELECT gs2.game_id 
        FROM game_subcategories gs2
        JOIN subcategories s2 ON gs2.subcategory_id = s2.id
        WHERE s2.slug = $${paramIndex++}
      )`;
      values.push(subcategory);
    }

    if (search) {
      query += ` AND g.title ILIKE $${paramIndex++}`;
      values.push(`%${search}%`);
    }

    query += `
      GROUP BY g.id
      ORDER BY g.deal_rating DESC, g.steam_rating_count DESC
      LIMIT 100;
    `;

    const result = await pool.query(query, values);
    res.json(result.rows || []);
  } catch (error) {
    console.error('❌ Error en GET /api/games:', error.message);
    res.json([]);
  }
});

// Endpoint: Obtener lista de subcategorías
app.get('/api/subcategories', async (req, res) => {
  try {
    const query = `
      SELECT s.id, s.name, s.slug, COUNT(gs.game_id) AS total_games
      FROM subcategories s
      JOIN game_subcategories gs ON s.id = gs.subcategory_id
      GROUP BY s.id, s.name, s.slug
      HAVING COUNT(gs.game_id) > 0
      ORDER BY total_games DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows || []);
  } catch (error) {
    console.error('❌ Error en GET /api/subcategories:', error.message);
    res.json([]);
  }
});

// Programar sincronización automática cada 6 horas
cron.schedule('0 */6 * * *', () => {
  console.log('⏰ Ejecutando sincronización automática programada...');
  syncDiscountedGames();
});

// Servir la aplicación Web Estática
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  syncDiscountedGames();
});