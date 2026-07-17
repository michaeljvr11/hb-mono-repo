// Shared env loader for the db-* scripts. Reads apps/api/.env so the scripts
// use the same credentials as the running app (falls back to compose defaults).
require('dotenv').config({ path: require('path').join(__dirname, '..', 'apps', 'api', '.env') });

module.exports = {
  DB_USERNAME: process.env.DB_USERNAME || 'hbuser',
  DB_DATABASE: process.env.DB_DATABASE || 'hb_ecommerce',
};
