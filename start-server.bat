@echo off
echo Starting AHCP Backend Server...
set NODE_ENV=development
set PORT=3001
set MONGODB_URI=mongodb://localhost:27017/ahcp_database
set JWT_SECRET=ahcp_super_secret_key_2024_development_only
set JWT_EXPIRES_IN=7d
node src/server.js
