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
  // El build inserta las rutas de las copias locales optimizadas.
  imageOverrides: __IMAGE_OVERRIDES__,
  responsiveImages: __RESPONSIVE_IMAGES__,
  supabaseUrl: '__SUPABASE_URL__',
  supabaseAnonKey: '__SUPABASE_ANON_KEY__',
  useSupabase: true,
  // Solo se usa en localhost. En un dominio real, si Supabase no está configurado,
  // el catálogo NO mostrará inventario de demostración como si fuera real.
  allowLocalPreviewFallback: false
});
