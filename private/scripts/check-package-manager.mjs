if (!String(process.env.npm_config_user_agent || '').startsWith('pnpm/')) {
  console.error('Instala dependencias con pnpm install --frozen-lockfile. Los scripts npm run siguen disponibles.');
  process.exit(1);
}
