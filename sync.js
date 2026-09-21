// =======================================================
// Archivo: sync.js
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

const PRIORITY_STEAM_IDS = [2344520, 1091500, 271590, 1172470, 632470];

async function syncDiscountedGames() {
  console.log('🔄 Iniciando sincronización de ofertas en Pesos Chilenos (CLP)...');

  try {
    let allDeals = [];

    for (let page = 0; page < 2; page++) {
      try {
        const response = await axios.get('https://www.cheapshark.com/api/1.0/deals', {
          params: {
            storeID: 1,
            sortBy: 'Savings',
            onSale: 1,
            pageSize: 250,
            pageNumber: page
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        });

        if (Array.isArray(response.data)) {
          allDeals = allDeals.concat(response.data);
        }
      } catch (cheapSharkErr) {
        console.error(`⚠️ Consulta aislada CheapShark pág ${page}:`, cheapSharkErr.message);
      }
    }

    const deals = allDeals.filter((deal) => parseFloat(deal.savings || 0) >= 70);
    console.log(`📦 Procesando ${deals.length} ofertas para obtener precios en CLP...`);

    const existingSteamIds = new Set(deals.map(d => parseInt(d.steamAppID)));
    for (const priorityId of PRIORITY_STEAM_IDS) {
      if (!existingSteamIds.has(priorityId)) {
        deals.push({
          steamAppID: priorityId.toString(),
          title: '',
          dealRating: '9.0',
          steamRatingCount: '1000'
        });
      }
    }

    for (const deal of deals) {
      const steamAppId = parseInt(deal.steamAppID);
      if (!steamAppId) continue;

      let title = deal.title || '';
      let normalPrice = 0;
      let currentPrice = 0;
      let discountPercent = 0;
      let dealRating = parseFloat(deal.dealRating || 0);
      let steamRatingCount = parseInt(deal.steamRatingCount || 0);
      let coverImage = deal.thumb || '';
      let subcategories = [];

      try {
        await sleep(250);
        const steamDetails = await axios.get(
          `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&cc=cl&l=spanish`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          }
        );

        const gameData = steamDetails.data?.[steamAppId]?.data;

        if (gameData) {
          if (gameData.is_free) continue;

          title = gameData.name || title;
          coverImage = gameData.header_image || coverImage;

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
      } catch (steamErr) {
        continue;
      }

      if (normalPrice <= 0 || discountPercent < 70) continue;

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

    console.log('✅ Sincronización completada con precios en CLP.');
  } catch (error) {
    console.error('❌ Error general en la sincronización:', error.message);
  }
}

module.exports = syncDiscountedGames;