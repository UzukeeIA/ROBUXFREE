@echo off
REM inicio.bat — Arranca la app, (intenta) usar PM2 en cluster, arranca ngrok si está disponible,
REM muestra la URL pública y te permite abrirla. Mantiene la ventana CMD abierta.

cd /d "%~dp0"

echo ====================================================
echo  Robux Kids Demo - Inicio
echo ====================================================

REM Instalar dependencias si no existen
if not exist node_modules (
  echo node_modules no encontrado. Ejecutando npm install...
  npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install falló. Revisa los mensajes anteriores.
    pause
    exit /b 1
  )
)

REM SESSION_SECRET temporal (cambiar en producción)
if "%SESSION_SECRET%"=="" set "SESSION_SECRET=change_this_secret"

set "NODE_ENV=production"

echo.
echo Intentando arrancar con PM2 en modo cluster (usa todos los núcleos)...
echo (Se usará npx para evitar instalación global)
npx pm2 start server.js -i max --name robux-kids-demo
if errorlevel 1 (
  echo.
  echo pm2 falló o no está disponible. Se intentará arrancar con node en una ventana separada.
  start "" cmd /k "node server.js"
  set "SERVER_METHOD=node"
) else (
  echo pm2 arrancó la app (cluster) correctamente.
  set "SERVER_METHOD=pm2"
)

timeout /t 1 >nul

REM Mostrar URL local
set "LOCAL_URL=http://localhost:3000"
echo.
echo URL local: %LOCAL_URL%

REM Intentar arrancar ngrok si está disponible para compartir públicamente
where ngrok >nul 2>&1
if %errorlevel% equ 0 (
  echo.
  echo ngrok encontrado. Iniciando ngrok http 3000 en segundo plano...
  REM arrancar ngrok en nueva ventana (no bloquea)
  start "" ngrok http 3000

  REM Esperar y consultar la API local de ngrok para obtener la URL pública
  echo Esperando ngrok (hasta ~12s) para obtener la URL pública...
  set "NGROK_URL="
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command ^
    "for($i=0;$i -lt 12;$i++){ Start-Sleep -s 1; try{ $t=Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -ErrorAction SilentlyContinue; if($t -and $t.tunnels.count -gt 0){ $t.tunnels[0].public_url; exit 0 } }catch{} }; exit 1"`) do (
    set "NGROK_URL=%%U"
  )

  if defined NGROK_URL (
    echo.
    echo URL pública (ngrok): %NGROK_URL%
    echo.
    set /p "OPENURL=¿Deseas abrir la URL pública en el navegador ahora? (s/n): "
    if /i "%OPENURL%"=="s" (
      start "" "%NGROK_URL%"
    ) else (
      echo Puedes copiar %NGROK_URL% para compartirla.
    )
  ) else (
    echo.
    echo No se pudo obtener la URL pública desde ngrok (tal vez todavía esté iniciando).
    echo Si ngrok se inició, abre http://127.0.0.1:4040 para ver la API de túneles y copiar la URL manualmente.
    echo También puedes ejecutar: ngrok http 3000  en otra ventana para ver la URL.
  )
) else (
  echo.
  echo ngrok no está instalado o no está en PATH.
  echo Si quieres compartir públicamente, instala ngrok (https://ngrok.com), autentícate y ejecuta:
  echo      ngrok http 3000
  echo Luego copia la "Forwarding" URL que te muestre ngrok.
  echo.
  set /p "OPENLOCAL=¿Deseas abrir la URL local en el navegador ahora? (s/n): "
  if /i "%OPENLOCAL%"=="s" (
    start "" "%LOCAL_URL%"
  )
)

echo.
echo ====================================================
echo Servidor iniciado usando: %SERVER_METHOD%
echo URL local: %LOCAL_URL%
if defined NGROK_URL echo URL pública (ngrok): %NGROK_URL%
echo ====================================================
echo.
echo Para ver logs (si usaste PM2): npx pm2 logs robux-kids-demo
echo Para listar procesos PM2: npx pm2 list
echo Para detener la app con PM2: npx pm2 stop robux-kids-demo && npx pm2 delete robux-kids-demo
echo.
echo La ventana permanecerá abierta. Pulsa cualquier tecla para finalizar este script (no detendrá PM2/ngrok si fueron arrancados en background).
pause >nul

REM Nota: Si arrancaste node en una ventana separada (start cmd /k "node server.js"), cierra esa ventana para detener el servidor.