// =======================================================
// Archivo: sync.js (Búsqueda Masiva Directa en Steam Chile)
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

const PRIORITY_STEAM_IDS = [
  2344520, // Diablo IV
  1091500, // Cyberpunk 2077
  271590,  // GTA V
  1172470, // Apex Legends
  632470,  // Disco Elysium
  1086940, // Baldur's Gate 3
  1245620, // ELDEN RING
  252490,  // Rust
  730      // Counter-Strike 2
];

async function syncDiscountedGames() {
  console.log('🔄 Iniciando sincronización masiva de ofertas en Pesos Chilenos (CLP)...');

  try {
    let rawDealsMap = new Map();

    // 1. Obtener destacados de la tienda oficial de Steam
    try {
      const featuredRes = await axios.get('https://store.steampowered.com/api/featuredcategories?cc=cl&l=spanish', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
        timeout: 8000
      });

      const specials = featuredRes.data?.specials?.items || [];
      specials.forEach(item => {
        if (item.id) {
          rawDealsMap.set(parseInt(item.id), { steamAppID: item.id.toString(), title: item.name || '' });
        }
      });
    } catch (err) {
      console.error('⚠️ Error en featuredcategories de Steam:', err.message);
    }

    // 2. Traer listas de ofertas desde CheapShark especificando múltiples páginas para rangos bajos
    const cheapSharkRequests = [
      { min: 1,  max: 50, pages: [0, 1, 2, 3] }, // Forzar más páginas para ofertas <= 50%
      { min: 51, max: 75, pages: [0, 1] },
      { min: 76, max: 100, pages: [0, 1] }
    ];

    for (const reqConfig of cheapSharkRequests) {
      for (const page of reqConfig.pages) {
        try {
          const url = `https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Savings&onSale=1&pageSize=60&lowerBound=${reqConfig.min}&upperBound=${reqConfig.max}&pageNumber=${page}`;
          const response = await axios.get(url, {
            headers: { 'User-Agent': 'DescuentosGetones/1.0 (contact@descuentosgetones.com)' },
            timeout: 10000
          });

          if (Array.isArray(response.data)) {
            response.data.forEach(deal => {
              const appId = parseInt(deal.steamAppID);
              if (appId && !rawDealsMap.has(appId)) {
                rawDealsMap.set(appId, deal);
              }
            });
          }
        } catch (err) {
          console.error(`⚠️ Error consultando rango ${reqConfig.min}-${reqConfig.max}% pág ${page}:`, err.message);
        }
      }
    }

    // 3. Incluir juegos prioritarios
    for (const priorityId of PRIORITY_STEAM_IDS) {
      if (!rawDealsMap.has(priorityId)) {
        rawDealsMap.set(priorityId, { steamAppID: priorityId.toString(), title: '' });
      }
    }

    const deals = Array.from(rawDealsMap.values());
    console.log(`📦 Procesando un total de ${deals.length} juegos recopilados...`);

    // 4. Validar precios y categorías en CLP contra Steam Chile
    for (const deal of deals) {
      const steamAppId = parseInt(deal.steamAppID);
      if (!steamAppId) continue;

      let title = deal.title || '';
      let normalPrice = 0;
      let currentPrice = 0;
      let discountPercent = 0;
      let dealRating = parseFloat(deal.dealRating || 8.0);
      let steamRatingCount = parseInt(deal.steamRatingCount || 500);
      let coverImage = deal.thumb || '';
      let subcategories = [];

      try {
        await sleep(200);
        const steamDetails = await axios.get(
          `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&cc=cl&l=spanish`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 8000
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

      if (normalPrice <= 0 || discountPercent < 1) continue;

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

    console.log('✅ Sincronización completada exitosamente.');
  } catch (error) {
    console.error('❌ Error general en la sincronización:', error.message);
  }
}

module.exports = syncDiscountedGames;