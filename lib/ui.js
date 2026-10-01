// lib/ui.js — DOM-слой: панель, бейджи, сортировка (CSS order), сравнение, глоссарий
const UI = {
  DEFAULTS: { gpu: 'RTX 3070', vramGB: 8, ramGB: 32, contextK: 8, sort: 'fit', hideNonGguf: false, hideMlx: false, hideGated: false, tasks: [], purposes: [], lang: 'en' },
  settings: null,
  props: new Map(),     // id → данные из data-props (numParameters, downloads, likes, pipeline_tag)
  enrich: new Map(),    // id → { isGguf, isMlx, license } из API
  readmeWarn: new Map(),// id → bool|null (форк-эвристика)
  readmeHead: new Map(),// id → первые 1500 символов
  selected: new Set(),  // id для сравнения (макс. 3)
  _timer: null,
  _toggles: [],         // [{el, key}] для сброса фильтров
  _chipEls: [],         // элементы чипов для сброса подсветки
  _hiddenEl: null,      // счётчик «скрыто: N»

  async init() {
    this.settings = { ...this.DEFAULTS };
    try { const o = await chrome.storage.sync.get('hfcsSettings'); if (o.hfcsSettings) Object.assign(this.settings, o.hfcsSettings); } catch {}
    I18N.set(this.settings.lang || 'en');
    CORE.GB_UNIT = T('gb');
    // миграция: до i18n назначения хранились по-русски — отбрасываем устаревшие значения
    const valid = new Set(CORE.PURPOSES.map(p => p.key));
    this.settings.purposes = (this.settings.purposes || []).filter(p => valid.has(p));
    this.readProps();
    this.buildPanel();
    this.scanCards();
    this.observe();
  },

  readProps() {
    try {
      const el = document.querySelector('[data-target="ModelList"]');
      if (!el || !el.dataset.props) return;
      const models = JSON.parse(el.dataset.props).initialValues.models || [];
      models.forEach(m => this.props.set(m.id, m));
    } catch {}
  },

  findCards() { return [...document.querySelectorAll('article.overview-card-wrapper')]; },

  cardId(card) {
    // HF умеет переписывать ссылку модели: при фильтрах (Hardware, Apps, Library…) она становится
    // абсолютной и с параметрами — https://huggingface.co/автор/имя?hardware=rtx-3070.
    // Поэтому принимаем и относительные, и абсолютные ссылки, с любым ?…#… хвостом,
    // и среди всех двухсегментных выбираем совпадающую с заголовком карточки.
    const re = /^(?:https:\/\/huggingface\.co)?\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:[?#].*)?$/;
    const ids = [...card.querySelectorAll('a[href]')]
      .map(a => (a.getAttribute('href') || '').match(re))
      .filter(Boolean)
      .map(m => m[1]);
    if (!ids.length) return null;
    const head = (card.querySelector('h4') || card).textContent || '';
    return ids.find(id => head.includes(id.split('/')[1])) || ids[0];
  },

  cardData(card) {
    const id = this.cardId(card);
    if (!id) return null;
    const p = this.props.get(id) || {};
    const e = this.enrich.get(id) || {};
    const parsed = CORE.parseModelName(id);
    let paramsB = p.numParameters ? p.numParameters / 1e9 : parsed.paramsB;
    if (!paramsB) {
      const badge = card.querySelector('span[title^="Number of parameters"]');
      if (badge) { const m = badge.textContent.match(/(\d+(?:\.\d+)?)\s*B/i); if (m) paramsB = parseFloat(m[1]); }
    }
    const lower = id.toLowerCase();
    return {
      id, paramsB, activeB: parsed.activeB, contextK: parsed.contextK,
      downloads: p.downloads, likes: p.likes, pipelineTag: p.pipeline_tag || null,
      purpose: (e.hasToolUse && CORE.purposeOf(id) === null) ? 'agent' : CORE.purposeOf(id),
      gated: !!p.gated,
      isGguf: e.isGguf != null ? e.isGguf : /gguf/.test(lower),
      isMlx: e.isMlx != null ? e.isMlx : /mlx/.test(lower),
      license: e.license || null
    };
  },

  verdictOf(d) {
    return CORE.verdict({ paramsB: d.paramsB, isGguf: d.isGguf, isMlx: d.isMlx,
      vramGB: this.settings.vramGB, ramGB: this.settings.ramGB, contextK: this.settings.contextK });
  },

  scanCards() {
    try {
      for (const card of this.findCards()) {
        let d = null;
        try { d = this.cardData(card); } catch { d = null; }
        if (!d) continue; // не модель: промо/провайдер-карточка в списке — пропускаем
        // штамп + наличие наших бейджей: если HF перерисовал содержимое карточки, бейджи пропали — рендерим заново
        if (card.dataset.hfcs === '1' && card.querySelector('.hfcs-badges')) continue;
        card.dataset.hfcs = '1';
        try {
          this.renderBadges(card);
          this.addCompareBox(card);
          this.highlightGlossary(card);
          this._enrichQueue.push(card);
        } catch { card.dataset.hfcs = ''; } // одна плохая карточка не должна рушить весь скан
      }
    } catch {}
    this.applyView();
    this._drainEnrich();
  },

  // ponytail: очередь с лимитом 4 параллельных — сотни карточек не долбят HF API
  _enrichQueue: [],
  _enrichActive: 0,
  _drainEnrich() {
    while (this._enrichActive < 4 && this._enrichQueue.length) {
      const card = this._enrichQueue.shift();
      this._enrichActive++;
      this.enrichCard(card).catch(() => {}).finally(() => { this._enrichActive--; this._drainEnrich(); });
    }
  },

  renderBadges(card) {
    const d = this.cardData(card);
    if (!d) return;
    const old = card.querySelector('.hfcs-badges');
    if (old) old.remove();
    const v = this.verdictOf(d);
    const box = document.createElement('div');
    box.className = 'hfcs-badges';

    const b = (cls, title) => { const s = document.createElement('span'); s.className = 'hfcs-badge ' + cls; if (title) s.title = title; box.appendChild(s); return s; };
    let verdictTitle = 'Q4_K_M ≈ ' + CORE.formatGB(v.q4) + ', Q8_0 ≈ ' + CORE.formatGB(v.q8);
    if (v.kv) verdictTitle += '; ' + T('vt.ctx', CORE.formatContext(this.settings.contextK), CORE.formatGB(v.kv));
    if (v.needVram != null) verdictTitle += '. ' + T('vt.total', CORE.formatGB(v.q4), CORE.formatGB(v.kv), CORE.formatGB(v.needVram), this.settings.vramGB);
    if (!d.isGguf && v.fp16 != null) verdictTitle += '. ' + T('vt.fp16', CORE.formatGB(v.fp16), CORE.formatGB(v.q4));
    if (v.needVram != null && v.key !== 'gpu' && v.key !== 'unknown') {
      verdictTitle += '. ' + T('v.sizeShort', CORE.formatGB(v.needVram), this.settings.vramGB, CORE.formatGB(Math.max(0, v.needVram - this.settings.vramGB)));
      if (v.key === 'cpu') verdictTitle += '; ' + T('vt.cpu', this.settings.ramGB);
    }
    b('hfcs-' + v.tone, verdictTitle).textContent = T(v.labelKey);
    if (d.gated) b('hfcs-gated', T('b.gatedTip')).textContent = T('b.gated');
    if (d.paramsB) b('hfcs-dim', T('b.sizesTip')).textContent = T('b.sizes', CORE.formatGB(v.q4), CORE.formatGB(v.q8));
    const fmt = d.isMlx ? 'MLX' : (d.isGguf ? 'GGUF' : (d.paramsB ? 'safetensors' : null));
    if (fmt) {
      const fb = b('hfcs-dim', T('b.formatTip'));
      fb.textContent = d.isGguf ? T('b.formatGguf') : fmt;
      if (d.isGguf) {
        fb.addEventListener('mouseenter', () => this.forkCheck(d.id, fb));
        fb.title = T('b.formatTipHover');
      }
    }
    if (d.license) { const l = LICENSES[d.license] || LICENSES['other']; b('hfcs-license', I18N.pick(l)).textContent = l.label; }
    if (d.purpose) {
      const full = (CORE.PURPOSES.find(p => p.key === d.purpose) || {}).full || '';
      b('hfcs-purpose hfcs-p-' + d.purpose, T('b.purposeTip', full)).textContent = T('p.' + d.purpose);
    }
    if (CORE.isFastCpu(d.activeB)) b('hfcs-moe').textContent = T('b.moe');
    if (d.contextK) b('hfcs-dim hfcs-ctx', T('b.ctxTip')).textContent = T('b.ctx', d.contextK);
    const bm = BENCHMARKS[d.id];
    if (bm) {
      if (bm.scores) {
        const s = bm.scores;
        const t = T('b.scoreTip', (bm.snapshot || '—'), s.avg, s.ifeval, s.bbh, s.math, s.gpqa, s.musr, s.mmluPro);
          
          
          
        b('hfcs-score', t).textContent = T('b.score', s.avg);
      }
      b('hfcs-tier hfcs-tier-' + bm.tier, T('b.tierTip', this.benchNote(bm), (bm.snapshot || '29.09.2026'))).textContent = bm.tier;
    }

    const links = document.createElement('span');
    links.className = 'hfcs-links';
    links.append(
      this.extLink(T('l.artificial'), 'https://artificialanalysis.ai/models?q=' + encodeURIComponent(this.name(d))),
      this.extLink(T('l.ggufHf'), 'https://huggingface.co/models?search=' + encodeURIComponent(d.id + ' gguf')),
      this.extLink(T('l.ollama'), 'https://ollama.com/search?q=' + encodeURIComponent(this.name(d)))
    );
    box.appendChild(links);

    const ggufBtn = document.createElement('button');
    ggufBtn.className = 'hfcs-btn'; ggufBtn.textContent = 'GGUF?';
    ggufBtn.addEventListener('click', async () => {
      ggufBtn.textContent = '…';
      const r = await API.hasGguf(d.id);
      ggufBtn.textContent = r === null ? T('btn.ggufUnknown') : (r ? T('btn.ggufYes') : T('btn.ggufNo'));
    });
    const pullBtn = document.createElement('button');
    pullBtn.className = 'hfcs-btn'; pullBtn.textContent = '⧉ ollama pull';
    pullBtn.title = T('btn.pullTip');
    pullBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText('ollama pull ' + this.name(d)); pullBtn.textContent = T('panel.copied'); }
      catch { pullBtn.textContent = T('panel.noClip'); }
      setTimeout(() => (pullBtn.textContent = '⧉ ollama pull'), 1500);
    });
    const aiBtn = document.createElement('button');
    aiBtn.className = 'hfcs-btn'; aiBtn.textContent = T('btn.ai');
    aiBtn.addEventListener('click', async () => {
      aiBtn.textContent = '…';
      try { await navigator.clipboard.writeText(await this.buildAiSummary(d)); aiBtn.textContent = T('btn.aiPaste'); }
      catch { aiBtn.textContent = T('panel.noClip'); }
      setTimeout(() => (aiBtn.textContent = T('btn.ai')), 1500);
    });
    box.append(ggufBtn, pullBtn, aiBtn);
    card.appendChild(box);
  },

  name(d) { return (d.id.split('/')[1] || d.id).toLowerCase(); },

  extLink(text, href) { const a = document.createElement('a'); a.className = 'hfcs-link'; a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a; },

  async enrichCard(card) {
    const d = this.cardData(card);
    if (!d) return;
    if (this.enrich.has(d.id)) { if (card.isConnected) { this.renderBadges(card); } return; }
    const info = await API.getModelInfo(d.id);
    if (!info) return;
    const tags = info.tags || [];
    this.enrich.set(d.id, {
      hasToolUse: tags.some(t => /tool[-_]?use|function[-_]?call/i.test(t)),
      isGguf: info.library_name === 'gguf' || tags.some(t => /gguf/i.test(t)),
      isMlx: info.library_name === 'mlx' || tags.some(t => /mlx/i.test(t)),
      license: (tags.find(t => /^license:/i.test(t)) || '').replace(/^license:/i, '') || null
    });
    if (!card.isConnected) return;
    this.renderBadges(card);
    this.applyView();
  },

  async forkCheck(id, badgeEl) {
    if (this.readmeWarn.has(id)) { this.appendForkNote(badgeEl, this.readmeWarn.get(id)); return; }
    const txt = await API.getText('https://huggingface.co/' + id + '/raw/main/README.md');
    const warn = txt == null ? null : CORE.hasForkWarning(txt);
    if (txt != null) this.readmeHead.set(id, txt.slice(0, 1500));
    this.readmeWarn.set(id, warn);
    this.appendForkNote(badgeEl, warn);
  },

  appendForkNote(badgeEl, warn) {
    const old = badgeEl.parentElement.querySelector('.hfcs-fork');
    if (old) old.remove();
    const s = document.createElement('span');
    s.className = 'hfcs-badge hfcs-fork ' + (warn === true ? 'hfcs-red' : warn === false ? 'hfcs-dim' : 'hfcs-neutral');
    s.textContent = warn === true ? T('f.warn')
      : warn === false ? T('f.none') : T('f.unavailable');
    badgeEl.parentElement.appendChild(s);
  },

  async buildAiSummary(d) {
    if (!this.readmeHead.has(d.id)) {
      const txt = await API.getText('https://huggingface.co/' + d.id + '/raw/main/README.md');
      if (txt != null) this.readmeHead.set(d.id, txt.slice(0, 1500));
    }
    const v = this.verdictOf(d);
    const lic = d.license ? (LICENSES[d.license] || LICENSES['other']).label : '?';
    return [
      '# ' + d.id,
      '- ' + T('ai.params') + ': ' + (d.paramsB ? Math.round(d.paramsB * 100) / 100 + 'B' : '?') + (d.activeB ? ' (' + T('ai.moe', d.activeB) + ')' : ''),
      '- Q4_K_M ≈ ' + CORE.formatGB(v.q4) + ', Q8_0 ≈ ' + CORE.formatGB(v.q8),
      '- ' + T('ai.verdict', this.settings.vramGB, this.settings.ramGB, T(v.labelKey)),
      '- ' + T('ai.format', (d.isMlx ? 'MLX' : d.isGguf ? 'GGUF' : 'safetensors'), lic),
      '', '## ' + T('ai.readme'), this.readmeHead.get(d.id) || T('ai.noData')
    ].join('\n');
  },

  highlightGlossary(card) {
    const h4 = card.querySelector('h4');
    if (!h4) return;
    const walker = document.createTreeWalker(h4, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const terms = Object.keys(GLOSSARY);
    for (const node of nodes) {
      let text = node.textContent, hit = null, pos = Infinity;
      for (const t of terms) {
        const i = text.toLowerCase().indexOf(t.toLowerCase());
        if (i >= 0 && i < pos) { hit = t; pos = i; }
      }
      if (!hit) continue;
      const frag = document.createDocumentFragment();
      frag.append(document.createTextNode(text.slice(0, pos)));
      const span = document.createElement('span');
      span.className = 'hfcs-term'; span.title = I18N.pick(GLOSSARY[hit]); span.textContent = text.slice(pos, pos + hit.length);
      frag.append(span, document.createTextNode(text.slice(pos + hit.length)));
      node.replaceWith(frag);
    }
  },

  addCompareBox(card) {
    const d = this.cardData(card);
    if (!d) return;
    const label = document.createElement('label');
    label.className = 'hfcs-cmp';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (this.selected.size >= 3) { cb.checked = false; alert(T('cmp.max')); return; }
        this.selected.add(d.id);
      } else this.selected.delete(d.id);
      this.updateCompareBar();
    });
    label.append(cb, document.createTextNode(T('btn.compare')));
    card.appendChild(label);
  },

  updateCompareBar() {
    let bar = document.querySelector('.hfcs-cmpbar');
    if (!this.selected.size) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'hfcs-cmpbar';
      const btn = document.createElement('button');
      btn.textContent = T('btn.compare');
      btn.addEventListener('click', () => this.showCompare());
      bar.appendChild(btn);
      document.body.appendChild(bar);
    }
    bar.firstChild.textContent = T('btn.compareN', this.selected.size);
  },

  showCompare() {
    let modal = document.querySelector('.hfcs-compare');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'hfcs-compare';
    const cards = this.findCards();
    const ds = [...this.selected].map(id => {
      const card = cards.find(c => this.cardId(c) === id);
      const d = card ? this.cardData(card) : null;
      return d ? { d, v: this.verdictOf(d) } : null;
    }).filter(Boolean);
    const rows = [
      [T('r.params'), x => x.d.paramsB ? x.d.paramsB + 'B' + (x.d.activeB ? ' (' + T('ai.moe', x.d.activeB) + ')' : '') : '?'],
      ['Q4_K_M', x => CORE.formatGB(x.v.q4)],
      ['Q8_0', x => CORE.formatGB(x.v.q8)],
      [T('r.verdict'), x => T(x.v.labelKey)],
      [T('r.format'), x => x.d.isMlx ? 'MLX' : x.d.isGguf ? 'GGUF' : 'safetensors'],
      [T('r.license'), x => x.d.license ? (LICENSES[x.d.license] || LICENSES['other']).label : '?'],
      [T('r.context'), x => x.d.contextK ? '~' + x.d.contextK + 'K' : '?'],
      [T('r.downloads'), x => x.d.downloads != null ? x.d.downloads.toLocaleString(I18N.lang) : '?'],
      [T('r.bench'), x => BENCHMARKS[x.d.id] ? BENCHMARKS[x.d.id].tier + ' — ' + this.benchNote(BENCHMARKS[x.d.id]) : '—'],
      [T('r.leaderboard'), x => { const b = BENCHMARKS[x.d.id]; return b && b.scores ? 'Avg ' + b.scores.avg + ' (IFEval ' + b.scores.ifeval + ', MMLU-Pro ' + b.scores.mmluPro + ')' : '—'; }]
    ];
    const table = document.createElement('table');
    const head = table.insertRow();
    head.appendChild(document.createElement('th'));
    ds.forEach(x => { const th = document.createElement('th'); th.textContent = x.d.id; head.appendChild(th); });
    rows.forEach(([label, fn]) => {
      const tr = table.insertRow();
      const td = tr.insertCell(); td.textContent = label;
      ds.forEach(x => { const c = tr.insertCell(); c.textContent = fn(x); });
    });
    const close = document.createElement('button');
    close.className = 'hfcs-close'; close.textContent = T('btn.close');
    close.addEventListener('click', () => modal.remove());
    modal.append(table, close);
    document.body.appendChild(modal);
  },

  buildPanel() {
    if (document.querySelector('.hfcs-panel')) return;
    const grid = document.querySelector('article.overview-card-wrapper')?.parentElement;
    if (!grid) return;
    const panel = document.createElement('div');
    panel.className = 'hfcs-panel';

    const lbl = (text, title) => { const s = document.createElement('span'); s.className = 'hfcs-lbl'; s.textContent = text; if (title) s.title = title; return s; };

    const sel = document.createElement('select');
    sel.className = 'hfcs-input'; sel.title = T('panel.gpuTip');
    GPU_PRESETS.forEach(g => { const o = document.createElement('option'); o.value = g.name; o.textContent = g.name + ' (' + g.vram + ' ' + T('gb') + ')'; sel.appendChild(o); });
    const custom = document.createElement('option'); custom.value = '__custom'; custom.textContent = T('panel.custom'); sel.appendChild(custom);
    sel.value = GPU_PRESETS.some(g => g.name === this.settings.gpu) ? this.settings.gpu : '__custom';

    const vram = document.createElement('input');
    vram.type = 'number'; vram.min = '1'; vram.className = 'hfcs-input hfcs-num';
    vram.title = T('panel.vramTip');
    vram.value = this.settings.vramGB;
    const ram = document.createElement('input');
    ram.type = 'number'; ram.min = '1'; ram.className = 'hfcs-input hfcs-num';
    ram.title = T('panel.ramTip');
    ram.value = this.settings.ramGB;

    sel.addEventListener('change', () => {
      const g = GPU_PRESETS.find(x => x.name === sel.value);
      if (g) { this.settings.gpu = g.name; vram.value = this.settings.vramGB = g.vram; this.save(); this.rerender(); }
    });
    vram.addEventListener('change', () => { this.settings.vramGB = Math.max(1, +vram.value || 8); this.settings.gpu = '__custom'; sel.value = '__custom'; this.save(); this.rerender(); });
    ram.addEventListener('change', () => { this.settings.ramGB = Math.max(1, +ram.value || 32); this.save(); this.rerender(); });

    const sort = document.createElement('select');
    sort.className = 'hfcs-input'; sort.title = T('panel.sortTip');
    [['fit', T('sort.fit')], ['size', T('sort.size')], ['downloads', T('sort.downloads')], ['none', T('sort.none')]]
      .forEach(([val, label]) => { const o = document.createElement('option'); o.value = val; o.textContent = label; sort.appendChild(o); });
    sort.value = this.settings.sort;
    sort.addEventListener('change', () => { this.settings.sort = sort.value; this.save(); this.applyView(); });

    const mkToggle = (key, label, tip) => {
      const l = document.createElement('label'); l.className = 'hfcs-toggle'; if (tip) l.title = tip;
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = this.settings[key];
      c.addEventListener('change', () => { this.settings[key] = c.checked; this.save(); this.applyView(); });
      this._toggles.push({ el: c, key });
      l.append(c, document.createTextNode(label));
      return l;
    };

    const chips = document.createElement('div');
    chips.className = 'hfcs-chips';
    const mkChip = (container, key, value, label, title) => {
      const c = document.createElement('button');
      c.className = 'hfcs-chip'; c.textContent = label;
      if (title) c.title = title;
      c.addEventListener('click', () => {
        const arr = this.settings[key];
        const i = arr.indexOf(value);
        if (i >= 0) { arr.splice(i, 1); c.classList.remove('hfcs-on'); }
        else { arr.push(value); c.classList.add('hfcs-on'); }
        this.save(); this.applyView();
      });
      if (this.settings[key].includes(value)) c.classList.add('hfcs-on');
      this._chipEls.push(c);
      container.appendChild(c);
    };
    [...new Set([...this.props.values()].map(m => m.pipeline_tag).filter(Boolean))].slice(0, 12)
      .forEach(tag => { const t = I18N.lang === 'ru' ? TASK_RU[tag] : null; mkChip(chips, 'tasks', tag, t ? t[0] : tag, t ? t[1] : tag); });

    const pchips = document.createElement('div');
    pchips.className = 'hfcs-chips'; pchips.title = T('panel.purposesTip');
    CORE.PURPOSES.forEach(p => mkChip(pchips, 'purposes', p.key, T('p.' + p.key), T('pt.' + p.key)));

    this._hiddenEl = document.createElement('span');
    this._hiddenEl.className = 'hfcs-lbl'; this._hiddenEl.textContent = T('panel.hidden', 0);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'hfcs-btn'; resetBtn.textContent = T('panel.reset'); resetBtn.title = T('panel.resetTip');
    resetBtn.addEventListener('click', () => {
      this.settings.tasks = []; this.settings.purposes = [];
      this.settings.hideNonGguf = false; this.settings.hideMlx = false;
      this._toggles.forEach(t => { t.el.checked = false; });
      this._chipEls.forEach(c => c.classList.remove('hfcs-on'));
      this.save(); this.applyView();
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'hfcs-btn'; exportBtn.textContent = T('panel.export');
    exportBtn.title = T('panel.exportTip');
    exportBtn.addEventListener('click', async () => {
      const md = this.exportList();
      try { await navigator.clipboard.writeText(md); exportBtn.textContent = T('panel.copied'); }
      catch { exportBtn.textContent = T('panel.noClip'); }
      setTimeout(() => (exportBtn.textContent = T('panel.export')), 1500);
    });

    const CTX_PRESETS = [32, 64, 128, 256, 512, 1024];
    const ctx = document.createElement('input');
    ctx.type = 'range'; ctx.min = '0'; ctx.max = '100'; ctx.step = '1';
    ctx.value = CORE.contextToPos(this.settings.contextK);
    ctx.className = 'hfcs-range';
    ctx.title = T('panel.contextTip');
    const ctxLbl = lbl(T('panel.context', CORE.formatContext(this.settings.contextK)), ctx.title);
    const ctxSel = document.createElement('select');
    ctxSel.className = 'hfcs-input';
    ctxSel.title = T('panel.contextPickTip');
    ctxSel.appendChild(new Option(T('panel.contextPick'), ''));
    CTX_PRESETS.forEach(v => ctxSel.appendChild(new Option(CORE.formatContext(v), String(v))));
    const syncCtxSel = () => { ctxSel.value = CTX_PRESETS.includes(this.settings.contextK) ? String(this.settings.contextK) : ''; };
    syncCtxSel();
    const applyCtx = (k) => {
      this.settings.contextK = k;
      ctx.value = CORE.contextToPos(k);
      ctxLbl.textContent = T('panel.context', CORE.formatContext(k));
      syncCtxSel();
      this.save(); this.rerender();
    };
    ctx.addEventListener('input', () => { ctxLbl.textContent = T('panel.context', CORE.formatContext(CORE.posToContext(+ctx.value))); });
    ctx.addEventListener('change', () => applyCtx(CORE.posToContext(+ctx.value)));
    ctxSel.addEventListener('change', () => { if (ctxSel.value) applyCtx(+ctxSel.value); });

    const guideBtn = document.createElement('button');
    guideBtn.className = 'hfcs-btn'; guideBtn.textContent = T('panel.guide');
    guideBtn.title = T('panel.guideTip');
    guideBtn.addEventListener('click', () => this.showLicenseGuide());

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'hfcs-btn'; reloadBtn.textContent = T('panel.reload');
    reloadBtn.title = T('panel.reloadTip');
    reloadBtn.addEventListener('click', () => location.reload());

    // Флаги — inline SVG: Windows не рисует флаговые эмодзи (🇷🇺 превращается в «RU»)
    const FLAGS = {
      ru: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 6" width="21" height="14"><rect width="9" height="2" fill="#fff"/><rect y="2" width="9" height="2" fill="#0039a6"/><rect y="4" width="9" height="2" fill="#d52b1e"/></svg>',
      en: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="21" height="14"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="3"/><path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"/></svg>'
    };
    const langBtn = document.createElement('button');
    langBtn.className = 'hfcs-btn hfcs-flag';
    langBtn.innerHTML = FLAGS[I18N.lang];
    langBtn.title = I18N.lang === 'ru' ? 'English' : 'Русский';
    langBtn.addEventListener('click', () => {
      this.settings.lang = I18N.lang === 'ru' ? 'en' : 'ru';
      I18N.set(this.settings.lang);
      this.save();
      location.reload();
    });

    const bestBtn = document.createElement('button');
    bestBtn.className = 'hfcs-btn'; bestBtn.textContent = T('panel.best');
    bestBtn.title = T('panel.bestTip');
    bestBtn.addEventListener('click', () => this.bestFit());

    // пары «подпись + контроль» не должны разрываться при переносе строк
    const grp = (...children) => { const s = document.createElement('span'); s.className = 'hfcs-grp'; s.append(...children); return s; };
    panel.append(
      grp(lbl(T('panel.gpu')), sel),
      grp(lbl(T('panel.vram'), T('panel.vramTip')), vram),
      grp(lbl(T('panel.ram'), T('panel.ramTip')), ram),
      grp(ctxLbl, ctx, ctxSel),
      grp(lbl(T('panel.sort')), sort),
      mkToggle('hideNonGguf', T('panel.hideNonGguf'), T('panel.hideNonGgufTip')), mkToggle('hideMlx', T('panel.hideMlx'), T('panel.hideMlxTip')), mkToggle('hideGated', T('panel.hideGated'), T('panel.hideGatedTip')),
      chips, pchips, this._hiddenEl, resetBtn, exportBtn, bestBtn, guideBtn, reloadBtn, langBtn);
    grid.parentElement.insertBefore(panel, grid);
    this.applyView();
  },

  exportList() {
    const rows = [[T('best.model'), T('r.params'), 'Q4, ' + T('gb'), 'Q8, ' + T('gb'), T('r.verdict'), T('r.format'), T('r.purpose'), T('r.license'), T('r.tier'), T('r.leaderboard'), T('r.downloads')]];
    rows.push(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']);
    for (const card of this.findCards()) {
      if (card.style.display === 'none') continue;
      const d = this.cardData(card); if (!d) continue;
      const v = this.verdictOf(d);
      const bm = BENCHMARKS[d.id];
      const gb = x => x == null ? '?' : Math.round(x * 10) / 10;
      rows.push([d.id, d.paramsB ? Math.round(d.paramsB * 100) / 100 + 'B' : '?', gb(v.q4), gb(v.q8), T(v.labelKey),
        d.isMlx ? 'MLX' : d.isGguf ? 'GGUF' : 'safetensors', d.purpose || '—', d.license || '—',
        bm ? bm.tier : '—', (bm && bm.scores) ? 'Avg ' + bm.scores.avg : '—',
        d.downloads != null ? String(d.downloads) : '?']);
    }
    return rows.map(r => '| ' + r.join(' | ') + ' |').join('\n');
  },

  showLicenseGuide() {
    const old = document.querySelector('.hfcs-guide'); if (old) old.remove();
    const modal = document.createElement('div');
    modal.className = 'hfcs-compare hfcs-guide';
    const hint = document.createElement('div');
    hint.className = 'hfcs-lbl';
    hint.textContent = T('g.hint');
    const table = document.createElement('table');
    Object.values(LICENSES).forEach(l => {
      const tr = table.insertRow();
      tr.insertCell().textContent = l.label;
      tr.insertCell().textContent = I18N.pick(l);
    });
    const close = document.createElement('button');
    close.className = 'hfcs-close'; close.textContent = T('btn.close');
    close.addEventListener('click', () => modal.remove());
    modal.append(hint, table, close);
    document.body.appendChild(modal);
  },

  bestFit() {
    const tierScore = { S: 4, A: 3, B: 2, C: 1 };
    const cands = new Map();
    // источник 1 — вся мини-БД: у этих моделей есть оценка (считаем, что берём GGUF-квант)
    for (const [id, bm] of Object.entries(BENCHMARKS)) {
      const parsed = CORE.parseModelName(id);
      cands.set(id, { id, paramsB: parsed.paramsB, activeB: parsed.activeB, downloads: null, isGguf: true, isMlx: false, license: null, purpose: bm.purpose || CORE.purposeOf(id), bm });
    }
    // источник 2 — видимые карточки страницы (дополняют загрузками и тем, чего нет в мини-БД)
    for (const card of this.findCards()) {
      if (card.style.display === 'none') continue;
      const d = this.cardData(card); if (!d) continue;
      const prev = cands.get(d.id);
      cands.set(d.id, { ...d, bm: prev ? prev.bm : null });
    }
    const out = [];
    for (const d of cands.values()) {
      const v = CORE.verdict({ paramsB: d.paramsB, isGguf: d.isGguf, isMlx: d.isMlx, vramGB: this.settings.vramGB, ramGB: this.settings.ramGB });
      if (v.key !== 'gpu' && v.key !== 'cpu') continue;
      if (this.settings.purposes.length && (!d.purpose || !this.settings.purposes.includes(d.purpose))) continue;
      out.push({ d, v, bm: d.bm, score: (v.key === 'gpu' ? 1e13 : 0) + (d.bm ? tierScore[d.bm.tier] || 0 : 0) * 1e12 + (d.downloads || 0) });
    }
    out.sort((a, b) => b.score - a.score);
    const top = out.slice(0, 5);
    this._showBestModal(top);
    return top.map(x => x.d.id);
  },

  _showBestModal(top) {
    const old = document.querySelector('.hfcs-best'); if (old) old.remove();
    const modal = document.createElement('div');
    modal.className = 'hfcs-compare hfcs-best';
    const hint = document.createElement('div');
    hint.className = 'hfcs-lbl';
    hint.textContent = top.length
      ? T('best.hint')
      : T('best.none');
    const table = document.createElement('table');
    const head = table.insertRow();
    [T('best.model'), T('best.tier'), T('r.verdict'), T('best.cmd')].forEach(h => { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    top.forEach(x => {
      const tr = table.insertRow();
      tr.insertCell().textContent = x.d.id;
      tr.insertCell().textContent = x.bm ? x.bm.tier + ' — ' + this.benchNote(x.bm) : T('best.noTier');
      tr.insertCell().textContent = T(x.v.labelKey);
      const cell = tr.insertCell();
      const btn = document.createElement('button');
      btn.className = 'hfcs-btn'; btn.textContent = '⧉ ollama pull ' + this.name(x.d);
      btn.title = T('btn.pullTip');
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText('ollama pull ' + this.name(x.d)); btn.textContent = T('panel.copied'); } catch {}
      });
      cell.appendChild(btn);
    });
    const close = document.createElement('button');
    close.className = 'hfcs-close'; close.textContent = T('btn.close');
    close.addEventListener('click', () => modal.remove());
    modal.append(hint, table, close);
    document.body.appendChild(modal);
  },

  benchNote(bm) { return I18N.lang === 'ru' ? bm.note : (bm.noteEn || bm.note); },

  rerender() {
    for (const card of this.findCards()) { if (card.dataset.hfcs) this.renderBadges(card); }
    this.applyView();
  },

  save() { try { chrome.storage.sync.set({ hfcsSettings: this.settings }); } catch {} },

  applyView() {
    if (!this.settings) return;
    const items = [];
    let hiddenCount = 0;
    for (const card of this.findCards()) {
      let d = null;
      try { d = this.cardData(card); } catch { d = null; }
      if (!d) continue;
      const v = this.verdictOf(d);
      let hide = (this.settings.hideMlx && d.isMlx) || (this.settings.hideNonGguf && !d.isGguf) || (this.settings.hideGated && d.gated);
      if (this.settings.tasks.length && d.pipelineTag) hide = hide || !this.settings.tasks.includes(d.pipelineTag);
      if (this.settings.purposes.length) hide = hide || !d.purpose || !this.settings.purposes.includes(d.purpose);
      card.style.display = hide ? 'none' : '';
      if (hide) hiddenCount++;
      else items.push({ card, d, v });
    }
    if (this._hiddenEl) this._hiddenEl.textContent = T('panel.hidden', hiddenCount);
    const cmp = {
      fit: (a, b) => CORE.verdictRank[a.v.key] - CORE.verdictRank[b.v.key] || (b.d.downloads || 0) - (a.d.downloads || 0),
      size: (a, b) => (a.d.paramsB || 1e9) - (b.d.paramsB || 1e9),
      downloads: (a, b) => (b.d.downloads || 0) - (a.d.downloads || 0)
    }[this.settings.sort];
    if (cmp) items.sort(cmp).forEach((x, i) => { x.card.style.order = i; });
  },

  observe() {
    // Наблюдаем за body: Svelte при гидрации/пагинации заменяет контейнер списка целиком.
    // ВАЖНО: throttle, а не debounce — при непрерывных мутациях (догрузка страниц, анимации)
    // debounce не срабатывал никогда, и бейджи на новых карточках не появлялись.
    new MutationObserver(() => {
      if (this._timer) return;
      this._timer = setTimeout(() => { this._timer = null; this.readProps(); this.scanCards(); this.buildPanel(); }, 400);
    }).observe(document.body, { childList: true, subtree: true });
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = { UI };
