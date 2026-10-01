// lib/api.js — публичный HF API без ключей + кэш (TTL 7 дней) + дедуп
// ponytail: кэш не ограничен по размеру; добавить вытеснение старейших при >1000 записей
const API = {
  TTL_MS: 7 * 24 * 3600 * 1000,
  _inflight: new Map(),

  async getModelInfo(id) {
    const c = await this._cacheGet(id);
    if (c && Date.now() - c.t < this.TTL_MS) return c.v;
    if (this._inflight.has(id)) return this._inflight.get(id);
    const p = fetch(`https://huggingface.co/api/models/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(v => { if (v) this._cacheSet(id, v); return v || null; })
      .catch(() => null)
      .finally(() => this._inflight.delete(id));
    this._inflight.set(id, p);
    return p;
  },
  async getText(url) {
    try { const r = await fetch(url); return r.ok ? r.text() : null; }
    catch { return null; }
  },
  async getConfig(id) {
    const txt = await this.getText(`https://huggingface.co/${id}/raw/main/config.json`);
    if (!txt) return null;
    try { const j = JSON.parse(txt); return { max_position_embeddings: j.max_position_embeddings || null }; }
    catch { return null; }
  },
  async hasGguf(id) {
    try {
      const r = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(id)}&filter=gguf&limit=5`);
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j) && j.length > 0;
    } catch { return null; }
  },
  async _cacheGet(id) {
    try { if (typeof chrome !== 'undefined' && chrome.storage) { const o = await chrome.storage.local.get(id); return o[id]; } } catch {}
    return null;
  },
  _cacheSet(id, v) {
    try { if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ [id]: { t: Date.now(), v } }); } catch {}
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
