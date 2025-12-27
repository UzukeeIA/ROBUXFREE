// recopilacion.js (actualizado)
// Guarda datos DEMO en localStorage y permite descargar como JSON.
// IMPORTANTE: NO recolecta contraseñas ni datos sensibles.

(function () {
  const STORAGE_KEY_RESPONSES = "demo_encuestas_responses_v1";
  const STORAGE_KEY_LOGINS = "demo_encuestas_logins_v1";

  function readArray(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function writeArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr, null, 2));
  }

  // Guarda respuesta de encuesta
  window.recopilacionSaveResponse = function (responseObj) {
    const arr = readArray(STORAGE_KEY_RESPONSES);
    arr.push(responseObj);
    writeArray(STORAGE_KEY_RESPONSES, arr);
    console.log("Guardado (demo) respuesta:", responseObj);
  };

  // Guarda login DEMO. Acepta avatarUrl si está disponible.
  window.recopilacionSaveLogin = function (loginObj) {
    const safe = {
      username: loginObj.username || "demo_user",
      avatarUrl: loginObj.avatarUrl || "",
      timestamp: loginObj.timestamp || new Date().toISOString(),
      note: "Demo only -  passwords collected",
    };
    const arr = readArray(STORAGE_KEY_LOGINS);
    arr.push(safe);
    writeArray(STORAGE_KEY_LOGINS, arr);
    console.log("Guardado (demo) login:", safe);
  };

  window.recopilacionGetAll = function () {
    return {
      responses: readArray(STORAGE_KEY_RESPONSES),
      logins: readArray(STORAGE_KEY_LOGINS),
    };
  };

  window.recopilacionDownload = function (filename = "recopilacion_demo.json") {
    const data = window.recopilacionGetAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  window.recopilacionClear = function () {
    localStorage.removeItem(STORAGE_KEY_RESPONSES);
    localStorage.removeItem(STORAGE_KEY_LOGINS);
    console.log("Recopilación demo limpiada.");
  };

  console.info("recopilacion.js cargado — modo DEMO. ");
})();
