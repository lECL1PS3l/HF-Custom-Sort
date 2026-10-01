// popup.js — вкл/выкл, перезагрузка вкладки, флаг языка. Язык берётся из hfcsSettings.lang (EN по умолчанию).
const STR = {
  en: {
    on: 'Enabled', reload: '⟳ Reload current tab', lang: 'Русский',
    hint: 'A Hugging Face tab opened before installing or updating the extension will not see it — reload it with this button (or F5).'
  },
  ru: {
    on: 'Включено', reload: '⟳ Обновить текущую вкладку', lang: 'English',
    hint: 'Вкладка Hugging Face, открытая до установки или обновления расширения, его не увидит — обнови её этой кнопкой (или F5).'
  }
};

// Флаги — inline SVG: Windows не рисует флаговые эмодзи
const FLAGS = {
  ru: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 6" width="21" height="14"><rect width="9" height="2" fill="#fff"/><rect y="2" width="9" height="2" fill="#0039a6"/><rect y="4" width="9" height="2" fill="#d52b1e"/></svg>',
  en: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="21" height="14"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="3"/><path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"/></svg>'
};

(async () => {
  const o = await chrome.storage.sync.get(['hfcsEnabled', 'hfcsSettings']);
  const lang = (o.hfcsSettings && o.hfcsSettings.lang === 'ru') ? 'ru' : 'en';
  const s = STR[lang];

  const cb = document.getElementById('on');
  cb.checked = o.hfcsEnabled !== false;
  cb.addEventListener('change', () => chrome.storage.sync.set({ hfcsEnabled: cb.checked }));

  document.getElementById('on-label').textContent = s.on;
  const reloadBtn = document.getElementById('reload');
  reloadBtn.textContent = s.reload;
  document.getElementById('hint').textContent = s.hint;

  const langBtn = document.getElementById('lang');
  langBtn.innerHTML = FLAGS[lang];
  langBtn.title = s.lang;
  langBtn.addEventListener('click', async () => {
    const st = o.hfcsSettings || {};
    st.lang = lang === 'ru' ? 'en' : 'ru';
    await chrome.storage.sync.set({ hfcsSettings: st });
    location.reload();
  });

  reloadBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id != null) chrome.tabs.reload(tab.id);
    } catch {}
    window.close();
  });
})();
