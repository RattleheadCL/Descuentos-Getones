// =======================================================
// Archivo: sync.js (Precios en Pesos Chilenos - CLP)
// =======================================================

const axios = require('axios');
const pool = require('./db');

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lista de AppIDs prioritarios para verificar
const PRIORITY_STEAM_IDS = [2344520, 1091500, 271590, 1172470, 632470]; // Includes Disco Elysium (632470)

async function syncDiscountedGames() {
  console.log('🔄 Sincronizando ofertas en Pesos Chilenos (CLP)...');

  try {
    let allDeals = [];

    // 1. Obtener ofertas activas de CheapShark
    for (let page = 0; page < 2; page++) {
      const response = await axios.get('https://www.cheapshark.com/api/1.0/deals', {
        params: {
          storeID: 1,
          sortBy: 'Savings',
          onSale: 1,
          pageSize: 250,
          pageNumber: page
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (Array.isArray(response.data)) {
        allDeals = allDeals.concat(response.data);
      }
    }

    const deals = allDeals.filter((deal) => parseFloat(deal.savings || 0) >= 70);
    console.log(`📦 Procesando ${deals.length} ofertas para obtener precios en CLP...`);

    const existingSteamIds = new Set(deals.map(d => parseInt(d.steamAppID)));
    for (const priorityId of PRIORITY_STEAM_IDS) {
      if (!existingSteamIds.has(priorityId)) {
        deals.push({
          steamAppID: priorityId.toString(),
          title: 'Consultando Steam...',
          savings: '75',
          dealRating: '9.0',
          steamRatingCount: '1000'
        });
      }
    }

    for (const deal of deals) {
      const steamAppId = parseInt(deal.steamAppID);
      if (!steamAppId) continue;

      let title = deal.title;
      let normalPrice = 0;
      let currentPrice = 0;
      let discountPercent = Math.round(parseFloat(deal.savings || 0));
      let dealRating = parseFloat(deal.dealRating || 0);
      let steamRatingCount = parseInt(deal.steamRatingCount || 0);
      let coverImage = deal.thumb || '';
      let subcategories = [];

      // 2. Consultar Steam API forzando la región de Chile (cc=cl)
      try {
        await sleep(200);
        const steamDetails = await axios.get(
          `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&cc=cl&l=spanish`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        );

        const gameData = steamDetails.data[steamAppId]?.data;

        if (gameData) {
          if (gameData.is_free) continue;

          title = gameData.name || title;
          coverImage = gameData.header_image || coverImage;

          // Obtener precios reales en CLP desde el precio oficial de Steam Chile
          if (gameData.price_overview) {
            normalPrice = Math.round(gameData.price_overview.initial / 100);
            currentPrice = Math.round(gameData.price_overview.final / 100);
            discountPercent = gameData.price_overview.discount_percent;
          }

          if (gameData.genres) {
            gameData.genres.forEach((g) => subcategories.push(g.description));
          }
          if (gameData.categories) {
            gameData.categories.forEach((c) => {
              const desc = c.description;
              if (['Co-op', 'Multi-player', 'Single-player', 'PvP', 'Online Co-op'].includes(desc)) {
                subcategories.push(desc);
              }
            });
          }
        }
      } catch (err) {
        // Ignorar errores individuales
      }

      // Validar que el juego tenga un precio válido registrado y mantenga descuento
      if (normalPrice <= 0 || discountPercent < 70) continue;

      // Upsert en la base de datos
      const gameQuery = `
        INSERT INTO games (
          steam_app_id, title, type, normal_price, 
          current_price, discount_percent, cover_image, steam_url,
          deal_rating, steam_rating_count, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (steam_app_id) DO UPDATE SET
          title = EXCLUDED.title,
          normal_price = EXCLUDED.normal_price,
          current_price = EXCLUDED.current_price,
          discount_percent = EXCLUDED.discount_percent,
          cover_image = EXCLUDED.cover_image,
          deal_rating = EXCLUDED.deal_rating,
          steam_rating_count = EXCLUDED.steam_rating_count,
          updated_at = NOW()
        RETURNING id;
      `;

      const gameRes = await pool.query(gameQuery, [
        steamAppId,
        title,
        'discount',
        normalPrice,
        currentPrice,
        discountPercent,
        coverImage,
        `https://store.steampowered.com/app/${steamAppId}`,
        dealRating,
        steamRatingCount
      ]);

      const gameId = gameRes.rows[0].id;

      // Guardar Subcategorías
      for (const subName of subcategories) {
        const subSlug = slugify(subName);
        if (!subSlug) continue;

        const subRes = await pool.query(
          `INSERT INTO subcategories (name, slug) 
           VALUES ($1, $2) 
           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name 
           RETURNING id;`,
          [subName, subSlug]
        );

        const subCategoryId = subRes.rows[0].id;

        await pool.query(
          `INSERT INTO game_subcategories (game_id, subcategory_id) 
           VALUES ($1, $2) 
           ON CONFLICT DO NOTHING;`,
          [gameId, subCategoryId]
        );
      }
    }

    console.log('✅ Sincronización en CLP completada exitosamente.');
  } catch (error) {
    console.error('❌ Error en sincronización:', error.message);
  }
}

module.exports = syncDiscountedGames;