🎮 Descuentos Getones

Plataforma web con estética Cyberpunk Neon diseñada para rastrear y visualizar ofertas de juegos en Steam Chile en tiempo real.

Nota: Este es un proyecto personal en desarrollo constante. Fue creado con el objetivo de facilitar a mis amigos y a la comunidad la búsqueda de descuentos atractivos de Steam configurados nativamente en Pesos Chilenos (CLP).

🌟 Características Principales

🇨🇱 Precios Nativos en CLP: Integración directa con la API de Steam configurada para la región de Chile (cc=cl), mostrando valores reales sin necesidad de conversiones manuales.

🎯 Filtros por Rangos de Descuento: Pestañas dedicadas para explorar ofertas según tu presupuesto:

💥 76% a 99% OFF

⚡ 51% a 75% OFF

🔥 50% o menos

🎁 100% GRATIS

🏷️ Filtrado por Subcategorías y Búsqueda: Filtra juegos rápidamente por género (Acción, RPG, Multijugador, etc.) o utiliza la barra de búsqueda en tiempo real.

📱 Diseño Responsive: Interfaz optimizada para una navegación fluida tanto en computadores como en dispositivos móviles.

🔄 Sincronización Automática: Un servicio en segundo plano actualiza periódicamente la base de datos con los títulos y promociones vigentes.

🛠️ Tecnologías Utilizadas

Backend: Node.js, Express.js

Base de Datos: PostgreSQL

Frontend: HTML5, JavaScript (Vanilla JS), Tailwind CSS CDN

Peticiones HTTP & Automatización: Axios, Node-Cron

Despliegue: Render.com (Web Service + PostgreSQL)

🚀 Instalación y Configuración Local

Si deseas probar o ejecutar el proyecto de forma local en tu máquina:

Clonar el repositorio:

git clone https://github.com/RattleheadCL/Descuentos-Getones.git
cd Descuentos-Getones


Instalar dependencias:

npm install


Configurar las variables de entorno:
Crea un archivo .env en la raíz del proyecto y agrega tu cadena de conexión a PostgreSQL:

DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/nombre_db
PORT=3000


Crear las tablas en la Base de Datos:
Ejecuta las sentencias del archivo schema.sql en tu gestor de PostgreSQL (pgAdmin, DBeaver, psql, etc.).

Iniciar la aplicación:

npm start


Abre tu navegador en http://localhost:3000.

📌 Estado del Proyecto

El proyecto se encuentra actualmente en fase activa de desarrollo. Se irán añadiendo nuevas funciones como:

Mejoras en los algoritmos de captura masiva de ofertas.

Sistema de favoritos o alertas de precio.

Optimizaciones adicionales de rendimiento e interfaz.

🤝 Contacto / Créditos

Creado por RattleheadCL.
