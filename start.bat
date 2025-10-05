@echo off
echo ========================================
echo    AHCP Backend - Animal Health System
echo ========================================
echo.

echo 📦 Installing dependencies...
call npm install

echo.
echo 🌱 Seeding database with sample data...
call npm run seed

echo.
echo 🚀 Starting development server...
call npm run dev

pause
