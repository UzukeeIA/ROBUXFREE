@echo off
REM stop.bat — Detiene y elimina la app gestionada por PM2 (si existe)
cd /d "%~dp0"
echo Deteniendo robux-kids-demo con pm2 (si está corriendo)...
npx pm2 stop robux-kids-demo
npx pm2 delete robux-kids-demo
echo Hecho.
pause