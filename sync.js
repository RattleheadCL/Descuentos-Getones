// =======================================================
// Archivo: sync.js (Con catálogo masivo de franquicias en CLP)
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

// Catálogo masivo de sagas y juegos populares para monitorear ofertas en Steam Chile
const PRIORITY_STEAM_IDS = [
  1174180, // Red Dead Redemption 2
  2668510, // Red Dead Redemption 1
  271590,  // Grand Theft Auto V
  2344520, // Diablo IV
  1091500, // Cyberpunk 2077
  292030,  // The Witcher 3: Wild Hunt
  1551360, // Forza Horizon 5
  1245620, // ELDEN RING
  1086940, // Baldur's Gate 3
  1593500, // God of War
  1817070, // Marvel's Spider-Man Remastered
  2195250, // EA SPORTS FC 24 / 25
  252490,  // Rust
  632470,  // Disco Elysium
  1172470, // Apex Legends
  550,     // Left 4 Dead 2
  221100,  // DayZ
  1085660, // Destiny 2
  2357570, // Overwatch 2
  359550,  // Tom Clancy's Rainbow Six Siege
  271590,  // GTA V
  1938090, // Call of Duty
  582010,  // Monster Hunter: World
  1235140, // Yakuza: Like a Dragon
  1151640, // Horizon Zero Dawn
  730      // Counter-Strike 2
];

async function syncDiscountedGames() {
  console.log('🔄 Iniciando sincronización de ofertas en Pesos Chilenos (CLP)...');

  try {
    let rawDealsMap = new Map();

    // 1. Cargar el catálogo masivo de AppIDs prioritarios y sagas
    for (const id of PRIORITY_STEAM_IDS) {
      rawDealsMap.set(id, { steamAppID: id.toString(), title: '' });
    }

    // 2. Traer todas las ofertas destacadas actuales de Steam Chile
    try {
      const featuredRes = await axios.get('https://store.steampowered.com/api/featuredcategories?cc=cl&l=spanish', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });

      const categories = featuredRes.data || {};
      Object.keys(categories).forEach(catKey => {
        const items = categories[catKey]?.items || [];
        items.forEach(item => {
          if (item.id) {
            rawDealsMap.set(parseInt(item.id), {
              steamAppID: item.id.toString(),
              title: item.name || ''
            });
          }
        });
      });
    } catch (featuredErr) {
      console.error('⚠️ Error en featuredcategories de Steam:', featuredErr.message);
    }

    // 3. Traer ofertas paginadas de la tienda de Steam Chile
    for (let start = 0; start < 200; start += 50) {
      try {
        const searchUrl = `https://store.steampowered.com/api/storesearch/?term=&l=spanish&cc=cl&start=${start}&count=50`;
        const response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 10000
        });

        const items = response.data?.items || [];
        items.forEach((item) => {
          if (item.id) {
            rawDealsMap.set(parseInt(item.id), {
              steamAppID: item.id.toString(),
              title: item.name || ''
            });
          }
        });
      } catch (searchErr) {
        console.error(`⚠️ Error en búsqueda de Steam (start=${start}):`, searchErr.message);
      }
    }

    const deals = Array.from(rawDealsMap.values());
    console.log(`📦 Procesando un total de ${deals.length} juegos en la lista de revisión...`);

    // 4. Consultar precios oficiales y ofertas en CLP contra la API de Steam Chile (cc=cl)
    for (const deal of deals) {
      const steamAppId = parseInt(deal.steamAppID);
      if (!steamAppId) continue;

      let title = deal.title || '';
      let normalPrice = 0;
      let currentPrice = 0;
      let discountPercent = 0;
      let dealRating = 8.0;
      let steamRatingCount = 1000;
      let coverImage = '';
      let subcategories = [];

      try {
        await sleep(200);
        const steamDetails = await axios.get(
          `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&cc=cl&l=spanish`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
          }
        );

        const gameData = steamDetails.data?.[steamAppId]?.data;

        if (gameData) {
          if (gameData.is_free) continue; // Ignorar juegos siempre F2P

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

      // Requisito: Debe estar en oferta activa (descuento >= 1%)
      if (normalPrice <= 0 || discountPercent < 1) continue;

      dealRating = (discountPercent / 10).toFixed(1);

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