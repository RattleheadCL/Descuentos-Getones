// =======================================================
// Archivo: public/app.js
// Descripción: Cliente web adaptado al estilo Cyberpunk Neón
//              para "Descuentos Getones" con precios en CLP.
// =======================================================

const API_BASE = '/api';

// Estado global de los filtros (por defecto desde 70%)
let currentDiscount = '70';
let currentSubcategory = '';
let currentSearch = '';

// Referencias al DOM
const gamesGrid = document.getElementById('gamesGrid');
const subcategoriesList = document.getElementById('subcategoriesList');
const searchInput = document.getElementById('searchInput');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');
const discountButtons = document.querySelectorAll('.tab-btn');

// Formateador oficial para Pesos Chilenos (CLP)
function formatCLP(amount) {
  const numericAmount = parseFloat(amount) || 0;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(numericAmount);
}

// Cargar lista de subcategorías con estilo Cyberpunk
async function loadSubcategories() {
  try {
    const res = await fetch(`${API_BASE}/subcategories`);
    const subcats = await res.json();

    subcategoriesList.innerHTML = `
      <button class="subcat-chip active bg-[#00f0ff] text-black font-bold border border-white px-3 py-1 text-xs uppercase transition-all" data-slug="">TODAS</button>
    `;

    subcats.forEach(sub => {
      const btn = document.createElement('button');
      btn.className = 'subcat-chip bg-[#0d0d18] text-slate-300 hover:text-[#00f0ff] border border-slate-700 hover:border-[#00f0ff] px-3 py-1 text-xs font-bold uppercase transition-all';
      btn.dataset.slug = sub.slug;
      btn.textContent = `${sub.name} (${sub.total_games})`;
      subcategoriesList.appendChild(btn);
    });

    // Eventos de selección de subcategorías
    subcategoriesList.querySelectorAll('.subcat-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        subcategoriesList.querySelectorAll('.subcat-chip').forEach(b => {
          b.className = 'subcat-chip bg-[#0d0d18] text-slate-300 hover:text-[#00f0ff] border border-slate-700 hover:border-[#00f0ff] px-3 py-1 text-xs font-bold uppercase transition-all';
        });
        e.target.className = 'subcat-chip active bg-[#00f0ff] text-black font-bold border border-white px-3 py-1 text-xs uppercase transition-all';
        
        currentSubcategory = e.target.dataset.slug;
        loadGames();
      });
    });
  } catch (error) {
    console.error('Error al cargar subcategorías:', error);
  }
}

// Cargar y renderizar las tarjetas con precios en CLP y colores Neón
async function loadGames() {
  loading.classList.remove('hidden');
  emptyState.classList.add('hidden');
  gamesGrid.innerHTML = '';

  const params = new URLSearchParams();
  if (currentDiscount) params.append('discount', currentDiscount);
  if (currentSubcategory) params.append('subcategory', currentSubcategory);
  if (currentSearch) params.append('search', currentSearch);

  try {
    const res = await fetch(`${API_BASE}/games?${params.toString()}`);
    const games = await res.json();

    loading.classList.add('hidden');

    if (games.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    games.forEach(game => {
      const card = document.createElement('article');
      card.className = 'bg-[#0a0a12] border-2 border-[#00f0ff]/30 hover:border-[#ff007f] transition-all duration-300 flex flex-col justify-between hover:shadow-[0_0_20px_rgba(255,0,127,0.3)] group';

      const isFree = game.discount_percent === 100 || parseFloat(game.current_price) === 0;
      const rating = parseFloat(game.deal_rating) > 0 ? game.deal_rating : 'N/A';
      
      const categoriesHtml = (game.subcategories || [])
        .filter(c => c !== null)
        .slice(0, 3)
        .map(c => `<span class="bg-[#121222] text-[#00f0ff] border border-[#00f0ff]/20 text-[10px] uppercase font-bold px-2 py-0.5">${c}</span>`)
        .join(' ');

      const formattedNormal = formatCLP(game.normal_price);
      const formattedCurrent = isFree ? 'GRATIS' : formatCLP(game.current_price);

      card.innerHTML = `
        <div>
          <div class="relative overflow-hidden">
            <img src="${game.cover_image}" alt="${game.title}" class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy">
            
            <!-- Rating de Popularidad Neón -->
            <span class="absolute top-2 left-2 bg-black/90 text-[#ffee00] border border-[#ffee00] font-cyber font-bold text-[10px] px-2 py-0.5 shadow-[0_0_10px_rgba(255,238,0,0.5)]">
              ⭐ ${rating}
            </span>

            <!-- Descuento Neón -->
            <span class="absolute top-2 right-2 ${isFree ? 'bg-[#ff007f] text-black shadow-[0_0_10px_#ff007f]' : 'bg-[#00f0ff] text-black shadow-[0_0_10px_#00f0ff]'} font-cyber font-black text-xs px-2.5 py-1">
              -${game.discount_percent}%
            </span>
          </div>
          
          <div class="p-4 space-y-3">
            <h3 class="font-cyber font-bold text-white text-sm line-clamp-1 group-hover:text-[#00f0ff] transition-colors">${game.title}</h3>
            <div class="flex flex-wrap gap-1">
              ${categoriesHtml}
            </div>
          </div>
        </div>

        <div class="p-4 pt-0 border-t border-[#00f0ff]/20 mt-3 flex items-center justify-between">
          <div>
            <span class="text-xs text-slate-500 line-through font-bold">${formattedNormal}</span>
            <div class="text-lg font-cyber font-black ${isFree ? 'text-[#ff007f] text-glow-pink' : 'text-[#ffee00] text-glow-yellow'}">
              ${formattedCurrent}
            </div>
          </div>
          
          <a href="${game.steam_url}" target="_blank" rel="noopener noreferrer" 
             class="bg-[#00f0ff] hover:bg-[#ff007f] text-black font-cyber font-bold text-xs px-3 py-2 transition-all duration-200 border border-white">
            STEAM ↗
          </a>
        </div>
      `;

      gamesGrid.appendChild(card);
    });

  } catch (error) {
    console.error('Error al cargar juegos:', error);
    loading.classList.add('hidden');
  }
}

// Filtros de descuento por solapas
discountButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    discountButtons.forEach(b => {
      b.className = 'tab-btn bg-[#0d0d18] text-[#00f0ff] hover:bg-[#00f0ff] hover:text-black font-cyber font-bold px-5 py-2.5 text-xs tracking-wider border-2 border-[#00f0ff]/50 hover:glow-cyan transition-all duration-200 uppercase';
    });
    
    if (e.target.dataset.discount === '100') {
      e.target.className = 'tab-btn active bg-[#ff007f] text-black font-cyber font-bold px-5 py-2.5 text-xs tracking-wider border-2 border-white glow-pink transition-all duration-200 uppercase';
    } else {
      e.target.className = 'tab-btn active bg-[#ffee00] text-black font-cyber font-bold px-5 py-2.5 text-xs tracking-wider border-2 border-white glow-yellow transition-all duration-200 uppercase';
    }

    currentDiscount = e.target.dataset.discount;
    loadGames();
  });
});

// Búsqueda en tiempo real con debounce
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentSearch = e.target.value.trim();
    loadGames();
  }, 300);
});

// Inicialización de la app
document.addEventListener('DOMContentLoaded', () => {
  loadSubcategories();
  loadGames();
});