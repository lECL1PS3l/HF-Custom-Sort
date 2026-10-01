// data/gpu.js — настольные NVIDIA, официальные значения VRAM
const GPU_PRESETS = [
  { name: 'GTX 1650', vram: 4 }, { name: 'GTX 1660', vram: 6 }, { name: 'GTX 1660 Super', vram: 6 },
  { name: 'RTX 2060', vram: 6 }, { name: 'RTX 2060 Super', vram: 8 }, { name: 'RTX 2070', vram: 8 },
  { name: 'RTX 2080', vram: 8 }, { name: 'RTX 2080 Ti', vram: 11 },
  { name: 'RTX 3050', vram: 8 }, { name: 'RTX 3060 8GB', vram: 8 }, { name: 'RTX 3060 12GB', vram: 12 },
  { name: 'RTX 3060 Ti', vram: 8 }, { name: 'RTX 3070', vram: 8 }, { name: 'RTX 3070 Ti', vram: 8 },
  { name: 'RTX 3080 10GB', vram: 10 }, { name: 'RTX 3080 12GB', vram: 12 }, { name: 'RTX 3080 Ti', vram: 12 },
  { name: 'RTX 3090', vram: 24 }, { name: 'RTX 3090 Ti', vram: 24 },
  { name: 'RTX 4060', vram: 8 }, { name: 'RTX 4060 Ti 8GB', vram: 8 }, { name: 'RTX 4060 Ti 16GB', vram: 16 },
  { name: 'RTX 4070', vram: 12 }, { name: 'RTX 4070 Super', vram: 12 }, { name: 'RTX 4070 Ti', vram: 12 },
  { name: 'RTX 4070 Ti Super', vram: 16 }, { name: 'RTX 4080', vram: 16 }, { name: 'RTX 4080 Super', vram: 16 },
  { name: 'RTX 4090', vram: 24 },
  { name: 'RTX 5060', vram: 8 }, { name: 'RTX 5060 Ti 8GB', vram: 8 }, { name: 'RTX 5060 Ti 16GB', vram: 16 },
  { name: 'RTX 5070', vram: 12 }, { name: 'RTX 5070 Ti', vram: 16 }, { name: 'RTX 5080', vram: 16 },
  { name: 'RTX 5090', vram: 32 }
];
if (typeof module !== 'undefined' && module.exports) module.exports = { GPU_PRESETS };
