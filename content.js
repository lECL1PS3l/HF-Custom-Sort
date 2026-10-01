// content.js — точка входа: только связывание, вся логика в lib/*
(async () => {
  try {
    const { hfcsEnabled = true } = await chrome.storage.sync.get('hfcsEnabled');
    if (!hfcsEnabled) return;
    UI.init();
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && 'hfcsEnabled' in ch) location.reload();
    });
  } catch (e) { /* сайт важнее расширения — молча выходим */ }
})();
