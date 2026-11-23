/* Configuración pública. Nunca coloques aquí la service_role key de Supabase. */
window.BATTING_CONFIG = Object.freeze({
  siteName: 'Batting Shop',
  instagram: 'battingshop.ve',
  instagramUrl: 'https://www.instagram.com/battingshop.ve/',
  whatsappDisplay: '+58 412-035-4375',
  whatsappE164: '584120354375',
  location: 'Maracaibo, Venezuela',
  shippingText: 'Envíos a toda Venezuela',
  payments: ['Zelle','Binance','Pago Móvil'],
  currency: 'USD',
  siteUrl: '__SITE_URL__',
  staticHosting: false,
  // Sustitución de la foto original de 150 px; una nueva carga usa su propia ruta.
  imageOverrides: {
    'ec686421-e5b1-456c-a1eb-2534866f2d44/6f13a647-7575-4fa1-867d-7360a5d5183e.webp': '/assets/images/nike-pro-youth-sleeve.webp',
    'ec686421-e5b1-456c-a1eb-2534866f2d44/6f13a647-7575-4fa1-867d-7360a5d5183e.thumb.webp': '/assets/images/nike-pro-youth-sleeve.thumb.webp'
  },
  supabaseUrl: '__SUPABASE_URL__',
  supabaseAnonKey: '__SUPABASE_ANON_KEY__',
  useSupabase: true,
  // Solo se usa en localhost. En un dominio real, si Supabase no está configurado,
  // el catálogo NO mostrará inventario de demostración como si fuera real.
  allowLocalPreviewFallback: false
});
