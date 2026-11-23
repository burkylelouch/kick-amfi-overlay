/**
 * Sanal Sınıf / Amfi — Kick.com OBS Browser Source
 * Modüler Yapı: Config -> AvatarGenerator -> ClassroomUI -> KickChatClient -> DebugPanel
 */

(() => {
  'use strict';

  // =========================================================================
  // 1. AYARLAR (CONFIG) — Buradan veya URL parametrelerinden özelleştirilebilir
  // =========================================================================
  const urlParams = new URLSearchParams(window.location.search);

  const CONFIG = {
    // Kick kanal adınız (ör. 'xqc') — URL parametresi ?channel=... bunu ezer
    CHANNEL_NAME: (urlParams.get('channel') || '').trim(),

    // Manuel Chatroom ID (Cloudflare engeline takılırsa buradan veya ?chatroomId=... ile verin)
    CHATROOM_ID: (urlParams.get('chatroomId') || '').trim(),

    // İsteğe bağlı özel WebSocket adresi (varsayılan olarak Kick Centrifugo API'den otomatik alınır)
    CUSTOM_WS_URL: (urlParams.get('wsUrl') || '').trim(),

    // Görünüm ayarları
    BACKGROUND: (urlParams.get('bg') || 'classroom').toLowerCase(), // 'classroom' | 'transparent'
    DEBUG: urlParams.get('debug') === 'true',
    HALL_TITLE: (urlParams.get('title') || 'AMFİ 101').trim(),

    // Komutlar (küçük harfe çevrilerek eşleştirilir)
    SIT_COMMANDS: ['!otur', '!dersegir'],
    LEAVE_COMMANDS: ['!kalk', '!cikis', '!çıkış'],

    // Konuşma balonu ve AFK ayarları
    BUBBLE_DURATION_MS: Math.max(1000, Number(urlParams.get('bubbleMs')) || 3000),
    BUBBLE_FADE_MS: 400,
    MAX_MESSAGE_LENGTH: 80,
    AFK_TIMEOUT_MS: Math.max(1, Number(urlParams.get('afk')) || 15) * 60 * 1000,
    AFK_CHECK_INTERVAL_MS: 15 * 1000,

    // Kademeli amfi sırası düzeni (arkadan öne 2 sıra, toplam 14 koltuk)
    ROWS: [
      { label: 'B', seats: 8, width: '96%' },
      { label: 'A', seats: 6, width: '80%' },
    ],
  };

  // =========================================================================
  // 2. YARDIMCI FONKSİYONLAR
  // =========================================================================

  /**
   * Kick emote'larını ([emote:12345:KEKW] ve :EMOJİ_ADİ: formatı) temizler
   * ve uzun mesajları 80 karakterde "..." ile keser.
   */
  function formatChatMessage(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') return '';

    const cleaned = rawContent
      .replace(/\[emote:\d+:[^\]]+\]/g, ' ')
      .replace(/(?:^|\s)(?::[^\s:]+:)+(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length <= CONFIG.MAX_MESSAGE_LENGTH) {
      return cleaned;
    }
    return cleaned.slice(0, CONFIG.MAX_MESSAGE_LENGTH - 3).trimEnd() + '...';
  }

  /**
   * Kullanıcı adı rengi çok koyuysa veya boşsa okunaklı bir renk döndürür.
   */
  function normalizeUserColor(hexColor) {
    const fallbackPalette = [
      '#60a5fa',
      '#f472b6',
      '#4ade80',
      '#facc15',
      '#c084fc',
      '#fb923c',
      '#2dd4bf',
      '#f87171',
    ];

    if (!hexColor || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hexColor)) {
      return fallbackPalette[Math.floor(Math.random() * fallbackPalette.length)];
    }

    let hex = hexColor.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    // Koyu renklerin koyu etiket üzerinde okunmasını sağlamak için parlaklık kontrolü
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance < 0.35) {
      const lift = (c) => Math.min(255, Math.round(c + (255 - c) * 0.45));
      return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
    }
    return hexColor;
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // =========================================================================
  // 3. PİKSEL-ART SVG AVATAR ÜRETİCİSİ (24x24 Izgara)
  // =========================================================================
  const AvatarGenerator = (() => {
    const OUTLINE = '#181825';

    const SKIN_TONES = [
      { base: '#FFDFC4', shadow: '#E8B896' },
      { base: '#F5CBA7', shadow: '#D8A27A' },
      { base: '#E6B08A', shadow: '#C48A62' },
      { base: '#C68642', shadow: '#9E652B' },
      { base: '#8D5524', shadow: '#6B3E17' },
    ];

    const HAIR_COLORS = [
      { base: '#2D2A3A', shadow: '#1C1A26', highlight: '#4B4661' },
      { base: '#593A2E', shadow: '#3D261D', highlight: '#7A5344' },
      { base: '#8A5430', shadow: '#633A1E', highlight: '#AD7047' },
      { base: '#E2B45C', shadow: '#BA8B38', highlight: '#F7D388' },
      { base: '#C43E32', shadow: '#912920', highlight: '#E56357' },
      { base: '#3B69B5', shadow: '#264882', highlight: '#6392DE' },
      { base: '#9B5DE5', shadow: '#7138B8', highlight: '#BE8DF7' },
      { base: '#EC4899', shadow: '#BD2B73', highlight: '#F77EBA' },
      { base: '#D8E0EB', shadow: '#A8B4C4', highlight: '#FFFFFF' },
    ];

    const SHIRT_COLORS = [
      { base: '#3B82F6', shadow: '#2563EB', accent: '#DBEAFE' },
      { base: '#EF4444', shadow: '#C82323', accent: '#FEE2E2' },
      { base: '#10B981', shadow: '#059669', accent: '#D1FAE5' },
      { base: '#F59E0B', shadow: '#D97706', accent: '#FEF3C7' },
      { base: '#8B5CF6', shadow: '#6D28D9', accent: '#EDE9FE' },
      { base: '#EC4899', shadow: '#BE185D', accent: '#FCE7F3' },
      { base: '#14B8A6', shadow: '#0F766E', accent: '#CCFBF1' },
      { base: '#F97316', shadow: '#C2410C', accent: '#FFEDD5' },
      { base: '#6366F1', shadow: '#4338CA', accent: '#E0E7FF' },
      { base: '#84CC16', shadow: '#4D7C0F', accent: '#ECFCCB' },
    ];

    const HAIR_STYLES = ['short', 'bob', 'spiky', 'bun', 'curly', 'beanie', 'cap'];
    const ACCESSORIES = ['none', 'none', 'glasses', 'sunglasses', 'headphones', 'blush'];

    function px(x, y, w, h, fill, opacity) {
      const op = opacity !== undefined ? ` opacity="${opacity}"` : '';
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${op} />`;
    }

    function randomSpec() {
      return {
        skin: pickRandom(SKIN_TONES),
        hair: pickRandom(HAIR_COLORS),
        shirt: pickRandom(SHIRT_COLORS),
        hairStyle: pickRandom(HAIR_STYLES),
        accessory: pickRandom(ACCESSORIES),
      };
    }

    function renderHairBack(style, hair) {
      if (style === 'bob') {
        return [
          px(4, 7, 16, 10, OUTLINE),
          px(5, 8, 14, 8, hair.shadow),
          px(5, 8, 2, 7, hair.base),
          px(17, 8, 2, 7, hair.base),
        ].join('');
      }
      if (style === 'bun') {
        return [
          px(9, 0, 6, 4, OUTLINE),
          px(10, 1, 4, 3, hair.base),
          px(10, 1, 2, 1, hair.highlight),
          px(10, 3, 4, 1, '#F472B6'),
        ].join('');
      }
      if (style === 'curly') {
        return [
          px(4, 4, 16, 10, OUTLINE),
          px(3, 6, 18, 6, OUTLINE),
          px(5, 5, 14, 8, hair.shadow),
          px(4, 7, 16, 5, hair.base),
        ].join('');
      }
      return '';
    }

    function renderHairFront(style, hair) {
      switch (style) {
        case 'short':
          return [
            px(7, 3, 10, 2, OUTLINE),
            px(6, 4, 12, 4, OUTLINE),
            px(7, 4, 10, 3, hair.base),
            px(6, 5, 12, 3, hair.base),
            px(8, 4, 4, 1, hair.highlight),
            px(6, 7, 2, 3, hair.base),
            px(16, 7, 2, 3, hair.base),
            px(8, 7, 3, 1, hair.shadow),
            px(13, 7, 2, 1, hair.shadow),
          ].join('');
        case 'bob':
          return [
            px(6, 3, 12, 2, OUTLINE),
            px(5, 4, 14, 4, OUTLINE),
            px(6, 4, 12, 3, hair.base),
            px(7, 4, 5, 1, hair.highlight),
            px(6, 7, 12, 1, hair.base),
            px(9, 7, 2, 1, hair.shadow),
            px(14, 7, 2, 1, hair.shadow),
            px(5, 7, 2, 8, hair.base),
            px(17, 7, 2, 8, hair.base),
            px(5, 14, 2, 1, hair.shadow),
            px(17, 14, 2, 1, hair.shadow),
          ].join('');
        case 'spiky':
          return [
            px(7, 2, 2, 2, OUTLINE),
            px(11, 1, 3, 3, OUTLINE),
            px(15, 2, 2, 2, OUTLINE),
            px(6, 3, 12, 5, OUTLINE),
            px(8, 2, 1, 2, hair.base),
            px(12, 2, 2, 2, hair.base),
            px(15, 3, 1, 2, hair.base),
            px(7, 4, 10, 3, hair.base),
            px(6, 5, 12, 2, hair.base),
            px(12, 2, 1, 1, hair.highlight),
            px(8, 4, 3, 1, hair.highlight),
            px(7, 7, 2, 2, hair.base),
            px(11, 7, 2, 1, hair.base),
            px(15, 7, 2, 2, hair.base),
          ].join('');
        case 'bun':
          return [
            px(7, 3, 10, 2, OUTLINE),
            px(6, 4, 12, 4, OUTLINE),
            px(7, 4, 10, 3, hair.base),
            px(8, 4, 4, 1, hair.highlight),
            px(6, 6, 2, 3, hair.base),
            px(16, 6, 2, 3, hair.base),
            px(8, 7, 8, 1, hair.shadow),
          ].join('');
        case 'curly':
          return [
            px(6, 2, 12, 3, OUTLINE),
            px(5, 3, 14, 5, OUTLINE),
            px(6, 3, 12, 4, hair.base),
            px(7, 3, 3, 1, hair.highlight),
            px(13, 3, 3, 1, hair.highlight),
            px(6, 7, 3, 1, hair.base),
            px(10, 7, 4, 1, hair.shadow),
            px(15, 7, 3, 1, hair.base),
            px(5, 6, 2, 4, hair.base),
            px(17, 6, 2, 4, hair.base),
          ].join('');
        case 'beanie':
          return [
            px(10, 0, 4, 2, OUTLINE),
            px(11, 1, 2, 1, hair.highlight),
            px(7, 2, 10, 2, OUTLINE),
            px(6, 3, 12, 5, OUTLINE),
            px(7, 3, 10, 3, hair.base),
            px(8, 3, 4, 1, hair.highlight),
            px(5, 6, 14, 3, OUTLINE),
            px(6, 6, 12, 2, hair.shadow),
            px(7, 6, 2, 2, hair.base),
            px(11, 6, 2, 2, hair.base),
            px(15, 6, 2, 2, hair.base),
          ].join('');
        case 'cap':
          return [
            px(7, 2, 10, 2, OUTLINE),
            px(6, 3, 12, 4, OUTLINE),
            px(7, 3, 10, 3, hair.base),
            px(8, 3, 4, 1, hair.highlight),
            px(6, 6, 16, 2, OUTLINE),
            px(7, 6, 14, 1, hair.shadow),
            px(16, 6, 4, 1, hair.base),
            px(6, 8, 2, 2, OUTLINE),
          ].join('');
        default:
          return '';
      }
    }

    function renderAccessory(acc) {
      if (acc === 'glasses') {
        return [
          px(7, 9, 4, 1, OUTLINE),
          px(13, 9, 4, 1, OUTLINE),
          px(7, 12, 4, 1, OUTLINE),
          px(13, 12, 4, 1, OUTLINE),
          px(7, 10, 1, 2, OUTLINE),
          px(10, 10, 1, 2, OUTLINE),
          px(13, 10, 1, 2, OUTLINE),
          px(16, 10, 1, 2, OUTLINE),
          px(11, 10, 2, 1, OUTLINE),
          px(8, 10, 2, 2, '#93C5FD', '0.28'),
          px(14, 10, 2, 2, '#93C5FD', '0.28'),
        ].join('');
      }
      if (acc === 'sunglasses') {
        return [
          px(6, 10, 12, 1, OUTLINE),
          px(7, 10, 4, 2, '#0F172A'),
          px(13, 10, 4, 2, '#0F172A'),
          px(8, 10, 1, 1, '#FFFFFF', '0.8'),
          px(14, 10, 1, 1, '#FFFFFF', '0.8'),
        ].join('');
      }
      if (acc === 'headphones') {
        return [
          px(7, 2, 10, 1, '#334155'),
          px(6, 3, 2, 2, '#334155'),
          px(16, 3, 2, 2, '#334155'),
          px(5, 5, 1, 4, '#334155'),
          px(18, 5, 1, 4, '#334155'),
          px(3, 9, 3, 5, OUTLINE),
          px(18, 9, 3, 5, OUTLINE),
          px(4, 10, 2, 3, '#EF4444'),
          px(18, 10, 2, 3, '#EF4444'),
          px(4, 10, 1, 1, '#FCA5A5'),
          px(19, 10, 1, 1, '#FCA5A5'),
        ].join('');
      }
      if (acc === 'blush') {
        return [
          px(7, 12, 2, 1, '#FB7185', '0.75'),
          px(15, 12, 2, 1, '#FB7185', '0.75'),
        ].join('');
      }
      return '';
    }

    function createAvatarSVG(spec = randomSpec()) {
      const { skin, hair, shirt, hairStyle, accessory } = spec;

      const body = [
        // Gövde dış hat
        px(6, 16, 12, 8, OUTLINE),
        px(5, 17, 14, 7, OUTLINE),
        // Sweatshirt / Tişört dolgu
        px(6, 17, 12, 7, shirt.base),
        // Yan gölgeler
        px(6, 18, 2, 6, shirt.shadow),
        px(16, 18, 2, 6, shirt.shadow),
        // Yaka ve kapüşon ipi detayı
        px(9, 17, 6, 1, shirt.accent),
        px(10, 18, 4, 1, shirt.accent),
        px(10, 19, 1, 3, shirt.accent, '0.85'),
        px(13, 19, 1, 3, shirt.accent, '0.85'),
        // Boyun
        px(10, 15, 4, 2, skin.shadow),
        px(10, 16, 4, 1, skin.base),
      ].join('');

      const head = [
        // Kulaklar
        px(5, 10, 2, 3, OUTLINE),
        px(17, 10, 2, 3, OUTLINE),
        px(6, 10, 1, 2, skin.base),
        px(17, 10, 1, 2, skin.base),
        px(6, 12, 1, 1, skin.shadow),
        px(17, 12, 1, 1, skin.shadow),
        // Kafa dış hat
        px(7, 5, 10, 10, OUTLINE),
        px(6, 6, 12, 8, OUTLINE),
        px(8, 15, 8, 1, OUTLINE),
        // Yüz dolgu
        px(7, 6, 10, 8, skin.base),
        px(8, 5, 8, 10, skin.base),
        // Çene gölgesi
        px(8, 14, 8, 1, skin.shadow),
      ].join('');

      const eyes = `
        <g class="avatar-eyes">
          ${px(8, 10, 2, 2, OUTLINE)}
          ${px(14, 10, 2, 2, OUTLINE)}
          ${px(9, 10, 1, 1, '#FFFFFF')}
          ${px(15, 10, 1, 1, '#FFFFFF')}
        </g>
      `;

      const mouth = `
        <g class="avatar-mouth-idle">
          ${px(10, 13, 4, 1, OUTLINE)}
        </g>
        <g class="avatar-mouth-talk">
          ${px(10, 12, 4, 2, OUTLINE)}
          ${px(11, 13, 2, 1, '#F472B6')}
        </g>
      `;

      return `
        <svg class="avatar-svg" viewBox="0 0 24 24" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          ${renderHairBack(hairStyle, hair)}
          ${body}
          ${head}
          ${eyes}
          ${mouth}
          ${renderHairFront(hairStyle, hair)}
          ${renderAccessory(accessory)}
        </svg>
      `;
    }

    return { createAvatarSVG, randomSpec };
  })();

  // =========================================================================
  // 4. SINIF / AMFİ YÖNETİCİSİ (CLASSROOM MANAGER)
  // =========================================================================
  class ClassroomManager {
    constructor(containerEl, onStateChange) {
      this.container = containerEl;
      this.onStateChange = onStateChange || (() => {});
      this.seats = []; // { id, rowIndex, colIndex, element, occupant }
      this.userSeatMap = new Map(); // normalizedUsername -> seat
      this.bubbleZCounter = 500;

      this.buildAmphitheater();
      this.startAfkWatcher();
    }

    buildAmphitheater() {
      this.container.innerHTML = '';
      this.seats = [];
      let seatCounter = 0;

      CONFIG.ROWS.forEach((rowDef, rowIndex) => {
        const rowEl = document.createElement('section');
        rowEl.className = 'amp-row';
        rowEl.style.setProperty('--row-width', rowDef.width);
        rowEl.style.setProperty('--row-z', String((rowIndex + 1) * 10));

        const platformEl = document.createElement('div');
        platformEl.className = 'row-platform';

        const seatsEl = document.createElement('div');
        seatsEl.className = 'row-seats';

        for (let col = 0; col < rowDef.seats; col++) {
          const seatId = `${rowDef.label}${col + 1}`;
          const seatEl = document.createElement('div');
          seatEl.className = 'seat';
          seatEl.dataset.seatId = seatId;

          if (col === 0) seatEl.classList.add('edge-left');
          if (col === rowDef.seats - 1) seatEl.classList.add('edge-right');

          const chairBack = document.createElement('div');
          chairBack.className = 'chair-back';

          const avatarSlot = document.createElement('div');
          avatarSlot.className = 'avatar-slot';

          seatEl.appendChild(chairBack);
          seatEl.appendChild(avatarSlot);
          seatsEl.appendChild(seatEl);

          this.seats.push({
            id: seatId,
            index: seatCounter++,
            rowIndex,
            colIndex: col,
            element: seatEl,
            avatarSlot,
            occupant: null,
          });
        }

        const deskEl = document.createElement('div');
        deskEl.className = 'row-desk';

        const rowLabel = document.createElement('span');
        rowLabel.className = 'row-label';
        rowLabel.textContent = `Sıra ${rowDef.label}`;
        deskEl.appendChild(rowLabel);

        // Dekoratif masa üstü defterleri
        const propsEl = document.createElement('div');
        propsEl.className = 'desk-props';
        for (let p = 0; p < Math.floor(rowDef.seats / 2); p++) {
          const nb = document.createElement('div');
          nb.className = p % 2 === 0 ? 'desk-notebook' : 'desk-notebook alt';
          propsEl.appendChild(nb);
        }
        deskEl.appendChild(propsEl);

        const riserEl = document.createElement('div');
        riserEl.className = 'row-riser';

        platformEl.appendChild(seatsEl);
        platformEl.appendChild(deskEl);
        platformEl.appendChild(riserEl);
        rowEl.appendChild(platformEl);
        this.container.appendChild(rowEl);
      });

      this.notifyChange();
    }

    getTotalSeats() {
      return this.seats.length;
    }

    getOccupiedCount() {
      return this.userSeatMap.size;
    }

    getSeatedUsernames() {
      return Array.from(this.userSeatMap.values()).map((seat) => seat.occupant.username);
    }

    seatUser(username, rawColor) {
      const key = username.toLowerCase();

      // Zaten oturuyorsa sadece AFK zamanını yenile
      if (this.userSeatMap.has(key)) {
        const existingSeat = this.userSeatMap.get(key);
        existingSeat.occupant.lastActivity = Date.now();
        return { ok: false, reason: 'already_seated', seatId: existingSeat.id };
      }

      const emptySeats = this.seats.filter((s) => !s.occupant);
      if (emptySeats.length === 0) {
        return { ok: false, reason: 'full' };
      }

      // En ön sıradan (en büyük rowIndex = Sıra A) başlayarak boş koltukları seç
      const frontMostRowIndex = Math.max(...emptySeats.map((s) => s.rowIndex));
      const frontRowEmptySeats = emptySeats.filter((s) => s.rowIndex === frontMostRowIndex);
      const chosenSeat = pickRandom(frontRowEmptySeats);
      const color = normalizeUserColor(rawColor);
      const avatarSpec = AvatarGenerator.randomSpec();

      // Avatar DOM
      const wrapper = document.createElement('div');
      wrapper.className = 'avatar-wrapper';
      wrapper.innerHTML = AvatarGenerator.createAvatarSVG(avatarSpec);

      // Giriş animasyonu bitince hafif idle nefes alma başlasın
      setTimeout(() => {
        if (wrapper.isConnected && !wrapper.classList.contains('leaving')) {
          wrapper.classList.add('idle');
        }
      }, 430);

      // Kullanıcı adı etiketi
      const nameTag = document.createElement('div');
      nameTag.className = 'username-tag';
      nameTag.textContent = username;
      nameTag.style.color = color;

      chosenSeat.avatarSlot.innerHTML = '';
      chosenSeat.avatarSlot.appendChild(wrapper);
      chosenSeat.element.appendChild(nameTag);
      chosenSeat.element.classList.add('occupied');

      chosenSeat.occupant = {
        key,
        username,
        color,
        avatarWrapper: wrapper,
        nameTag,
        bubbleEl: null,
        bubbleTimer: null,
        fadeTimer: null,
        lastActivity: Date.now(),
      };

      this.userSeatMap.set(key, chosenSeat);
      this.notifyChange();

      return { ok: true, seatId: chosenSeat.id };
    }

    unseatUser(username, immediate = false) {
      const key = username.toLowerCase();
      const seat = this.userSeatMap.get(key);
      if (!seat || !seat.occupant) {
        return false;
      }

      const occ = seat.occupant;
      clearTimeout(occ.bubbleTimer);
      clearTimeout(occ.fadeTimer);

      if (occ.bubbleEl) {
        occ.bubbleEl.remove();
      }
      if (occ.nameTag) {
        occ.nameTag.remove();
      }

      seat.occupant = null;
      seat.element.classList.remove('occupied', 'has-bubble');
      seat.element.style.zIndex = '';
      this.userSeatMap.delete(key);
      this.updateRowBubblePositions(seat.rowIndex);

      if (immediate) {
        seat.avatarSlot.innerHTML = '';
      } else {
        occ.avatarWrapper.classList.remove('idle');
        occ.avatarWrapper.classList.add('leaving');
        setTimeout(() => {
          if (occ.avatarWrapper.isConnected) {
            occ.avatarWrapper.remove();
          }
        }, 290);
      }

      this.notifyChange();
      return true;
    }

    showSpeechBubble(username, rawMessage) {
      const key = username.toLowerCase();
      const seat = this.userSeatMap.get(key);
      if (!seat || !seat.occupant) {
        return false;
      }

      const text = formatChatMessage(rawMessage);
      if (!text) return false;

      const occ = seat.occupant;
      occ.lastActivity = Date.now();

      // Önceki zamanlayıcıları ve balonu temizle (süre sıfırlanır)
      clearTimeout(occ.bubbleTimer);
      clearTimeout(occ.fadeTimer);
      if (occ.bubbleEl) {
        occ.bubbleEl.remove();
        occ.bubbleEl = null;
      }

      // Yeni konuşma balonu
      const bubble = document.createElement('div');
      bubble.className = 'speech-bubble';
      bubble.textContent = text;

      this.bubbleZCounter += 1;
      bubble.style.zIndex = String(this.bubbleZCounter);
      seat.element.classList.add('has-bubble');
      seat.element.appendChild(bubble);
      occ.bubbleEl = bubble;

      // Aynı sıradaki konuşma balonları çakışıyorsa birbirinden hafifçe uzaklaştır
      this.updateRowBubblePositions(seat.rowIndex);

      // 3 saniye sonra yumuşak fade-out
      occ.bubbleTimer = setTimeout(() => {
        if (!bubble.isConnected) return;
        bubble.classList.add('fading-out');

        occ.fadeTimer = setTimeout(() => {
          if (bubble.isConnected) {
            bubble.remove();
          }
          if (seat.occupant && seat.occupant.bubbleEl === bubble) {
            seat.occupant.bubbleEl = null;
            seat.element.classList.remove('has-bubble');
            seat.element.style.zIndex = '';
            this.updateRowBubblePositions(seat.rowIndex);
          }
        }, CONFIG.BUBBLE_FADE_MS);
      }, CONFIG.BUBBLE_DURATION_MS);

      return true;
    }

    /**
     * Aynı sıradaki aktif konuşma balonları üst üste binmesin diye
     * birbirlerinden yatayda (gerekirse dikeyde) hafifçe uzaklaştırır.
     */
    updateRowBubblePositions(rowIndex) {
      const activeSeats = this.seats
        .filter(
          (s) =>
            s.rowIndex === rowIndex &&
            s.occupant &&
            s.occupant.bubbleEl &&
            s.occupant.bubbleEl.isConnected
        )
        .sort((a, b) => a.colIndex - b.colIndex);

      if (activeSeats.length === 0) return;

      const MIN_GAP = 10;
      const VIEWPORT_MARGIN = 12;
      const viewportWidth = window.innerWidth;
      const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

      const items = activeSeats.map((seat) => {
        const bubble = seat.occupant.bubbleEl;
        const seatRect = seat.element.getBoundingClientRect();
        const width = bubble.offsetWidth;
        const height = bubble.offsetHeight;
        const isEdgeLeft = seat.element.classList.contains('edge-left');
        const isEdgeRight = seat.element.classList.contains('edge-right');

        let baseLeft;
        if (isEdgeLeft) {
          baseLeft = seatRect.left + seatRect.width * 0.16;
        } else if (isEdgeRight) {
          baseLeft = seatRect.right - seatRect.width * 0.16 - width;
        } else {
          baseLeft = seatRect.left + seatRect.width * 0.5 - width / 2;
        }

        const maxShift = Math.max(48, width * 0.48);
        const vpMin = VIEWPORT_MARGIN;
        const vpMax = Math.max(VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - width);

        const minLeft = Math.max(vpMin, baseLeft - maxShift);
        const maxLeft = Math.min(vpMax, baseLeft + maxShift);
        const clampedMin = Math.min(minLeft, maxLeft);
        const clampedMax = Math.max(minLeft, maxLeft);

        return {
          seat,
          bubble,
          width,
          height,
          isEdgeLeft,
          isEdgeRight,
          baseLeft,
          left: clamp(baseLeft, clampedMin, clampedMax),
          minLeft: clampedMin,
          maxLeft: clampedMax,
          shiftY: 0,
        };
      });

      // 1) Yatayda birbirinden uzaklaştırma (çakışan komşuları zıt yönlere it)
      for (let iter = 0; iter < 12; iter++) {
        let moved = false;
        for (let i = 0; i < items.length - 1; i++) {
          const a = items[i];
          const b = items[i + 1];
          const overlap = a.left + a.width + MIN_GAP - b.left;

          if (overlap > 0.5) {
            const aRoom = Math.max(0, a.left - a.minLeft);
            const bRoom = Math.max(0, b.maxLeft - b.left);

            let pushA = Math.min(overlap / 2, aRoom);
            let pushB = Math.min(overlap / 2, bRoom);
            let rem = overlap - pushA - pushB;

            if (rem > 0) {
              const extraA = Math.min(rem, aRoom - pushA);
              pushA += extraA;
              rem -= extraA;
              const extraB = Math.min(rem, bRoom - pushB);
              pushB += extraB;
            }

            if (pushA > 0 || pushB > 0) {
              a.left -= pushA;
              b.left += pushB;
              moved = true;
            }
          }
        }
        if (!moved) break;
      }

      // 2) Yatay alan yetmezse (örn. 3+ kişi aynı anda uzun mesaj) hafifçe yukarı kademele
      for (let i = 0; i < items.length; i++) {
        const cur = items[i];
        let changed = true;
        let guard = 0;
        while (changed && guard < 10) {
          changed = false;
          guard++;
          for (let j = 0; j < i; j++) {
            const prev = items[j];
            const horizOverlap =
              prev.left + prev.width + 4 > cur.left && cur.left + cur.width + 4 > prev.left;
            if (!horizOverlap) continue;

            const vertOverlap =
              cur.shiftY < prev.shiftY + prev.height + 8 &&
              prev.shiftY < cur.shiftY + cur.height + 8;
            if (vertOverlap) {
              cur.shiftY = prev.shiftY + prev.height + 8;
              changed = true;
            }
          }
        }
      }

      // 3) Hesaplanan kaymaları ve balon kuyruğu dengesini uygula
      items.forEach((item) => {
        const shiftX = Math.round(item.left - item.baseLeft);
        const shiftY = Math.round(item.shiftY);

        let tailShiftX;
        const cornerSafe = 18;
        if (item.isEdgeLeft) {
          tailShiftX = clamp(-shiftX, cornerSafe - 26, item.width - cornerSafe - 26);
        } else if (item.isEdgeRight) {
          tailShiftX = clamp(-shiftX, 26 - (item.width - cornerSafe), 26 - cornerSafe);
        } else {
          const maxTail = Math.max(0, item.width / 2 - cornerSafe);
          tailShiftX = clamp(-shiftX, -maxTail, maxTail);
        }

        item.bubble.style.setProperty('--bubble-shift-x', `${shiftX}px`);
        item.bubble.style.setProperty('--bubble-shift-y', `${shiftY}px`);
        item.bubble.style.setProperty('--tail-shift-x', `${Math.round(tailShiftX)}px`);
      });
    }

    clearAll() {
      const keys = Array.from(this.userSeatMap.keys());
      keys.forEach((k) => {
        const seat = this.userSeatMap.get(k);
        if (seat && seat.occupant) {
          this.unseatUser(seat.occupant.username, true);
        }
      });
    }

    startAfkWatcher() {
      setInterval(() => {
        const now = Date.now();
        const expired = [];
        this.userSeatMap.forEach((seat) => {
          if (seat.occupant && now - seat.occupant.lastActivity >= CONFIG.AFK_TIMEOUT_MS) {
            expired.push(seat.occupant.username);
          }
        });
        expired.forEach((username) => {
          this.unseatUser(username);
          logDebug(`AFK süresi doldu, koltuktan kaldırıldı: ${username}`);
        });
      }, CONFIG.AFK_CHECK_INTERVAL_MS);
    }

    notifyChange() {
      this.onStateChange({
        occupied: this.getOccupiedCount(),
        total: this.getTotalSeats(),
      });
    }
  }

  // =========================================================================
  // 5. KICK CHAT BAĞLANTISI (YEREL SUNUCU SSE -> KICK CENTRIFUGO KÖPRÜSÜ)
  // =========================================================================
  class KickChatClient {
    constructor({ onMessage, onStatus }) {
      this.onMessage = onMessage;
      this.onStatus = onStatus;
      this.eventSource = null;
      this.chatroomId = null;
      this.stopped = false;
    }

    async start() {
      if (CONFIG.CHATROOM_ID) {
        this.chatroomId = CONFIG.CHATROOM_ID;
        this.connectStream();
        return;
      }

      if (!CONFIG.CHANNEL_NAME) {
        this.setStatus('idle', 'Kanal ayarlanmadı (?channel=... veya ?chatroomId=...)');
        logDebug('Bağlantı için ?channel=kanaladi veya ?chatroomId=12345 girin.');
        return;
      }

      this.setStatus('connecting', `${CONFIG.CHANNEL_NAME} kanalı bulunuyor...`);
      try {
        const encoded = encodeURIComponent(CONFIG.CHANNEL_NAME);
        const endpoints =
          window.location.protocol === 'http:' || window.location.protocol === 'https:'
            ? [`/api/channel/${encoded}`, `https://kick.com/api/v2/channels/${encoded}`]
            : [`https://kick.com/api/v2/channels/${encoded}`];

        let data = null;
        let lastErr = null;
        for (const url of endpoints) {
          try {
            const res = await fetch(url);
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            data = await res.json();
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!data) {
          throw lastErr || new Error('Kanal bilgisi alınamadı');
        }
        const id = data?.chatroom?.id;
        if (!id) {
          throw new Error('chatroom.id bulunamadı');
        }
        this.chatroomId = String(id);
        logDebug(`Chatroom ID otomatik alındı: ${this.chatroomId}`);
        this.connectStream();
      } catch (err) {
        this.setStatus('error', 'API engellendi — chatroomId gerekli');
        logDebug(
          `Kick API alınamadı (${err.message}). Cloudflare engeli varsa URL'ye ?chatroomId=ID ekleyin.`
        );
      }
    }

    connectStream() {
      if (this.stopped || !this.chatroomId) return;

      this.cleanupStream();
      this.setStatus('connecting', `Bağlanıyor (Oda: ${this.chatroomId})...`);

      const streamUrl = `/api/chat-stream?chatroomId=${encodeURIComponent(this.chatroomId)}`;
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.addEventListener('status', (event) => {
        try {
          const data = JSON.parse(event.data);
          this.setStatus(data.state || 'idle', data.text || '');
        } catch {
          // yoksay
        }
      });

      this.eventSource.addEventListener('log', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.text) logDebug(data.text);
        } catch {
          // yoksay
        }
      });

      this.eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.username && typeof data.content === 'string') {
            this.onMessage(data);
          }
        } catch {
          // yoksay
        }
      });

      this.eventSource.addEventListener('error', () => {
        this.setStatus('error', 'Yerel sunucu akışı koptu, yeniden bağlanılıyor...');
      });
    }

    cleanupStream() {
      if (this.eventSource) {
        try {
          this.eventSource.close();
        } catch {
          // yoksay
        }
        this.eventSource = null;
      }
    }

    setStatus(state, text) {
      if (this.onStatus) {
        this.onStatus(state, text);
      }
    }
  }

  // =========================================================================
  // 6. UYGULAMA BAŞLATMA VE KOMUT İŞLEYİCİ
  // =========================================================================

  const amphitheaterEl = document.getElementById('amphitheater');
  const hallTitleEl = document.getElementById('hall-title');
  const hudSeatCountEl = document.getElementById('hud-seat-count');
  const hudStatusDotEl = document.getElementById('hud-status-dot');

  const debugPanelEl = document.getElementById('debug-panel');
  const debugBodyEl = document.getElementById('debug-body');
  const debugConnDotEl = document.getElementById('debug-conn-dot');
  const debugConnTextEl = document.getElementById('debug-conn-text');
  const debugSeatInfoEl = document.getElementById('debug-seat-info');
  const debugLogEl = document.getElementById('debug-log');

  // Arka plan modu uygula
  function applyBackgroundMode(mode) {
    const isTransparent = mode === 'transparent';
    document.documentElement.classList.toggle('bg-transparent', isTransparent);
    document.body.classList.toggle('bg-transparent', isTransparent);
  }

  applyBackgroundMode(CONFIG.BACKGROUND);
  if (hallTitleEl) {
    hallTitleEl.textContent = CONFIG.HALL_TITLE;
  }

  // Duvar saati güncelleme
  function updateWallClock() {
    const now = new Date();
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const hourEl = document.querySelector('.clock-hour');
    const minEl = document.querySelector('.clock-minute');
    if (hourEl && minEl) {
      hourEl.style.transform = `rotate(${hours * 30 + minutes * 0.5}deg)`;
      minEl.style.transform = `rotate(${minutes * 6}deg)`;
    }
  }
  updateWallClock();
  setInterval(updateWallClock, 30000);

  function logDebug(text) {
    if (!CONFIG.DEBUG || !debugLogEl) return;
    const item = document.createElement('div');
    item.className = 'debug-log-item';
    const time = new Date().toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    item.textContent = `[${time}] ${text}`;
    debugLogEl.prepend(item);
    while (debugLogEl.children.length > 25) {
      debugLogEl.lastChild.remove();
    }
  }

  // Sınıf Yöneticisi
  const classroom = new ClassroomManager(amphitheaterEl, ({ occupied, total }) => {
    const text = `${occupied} / ${total}`;
    if (hudSeatCountEl) hudSeatCountEl.textContent = text;
    if (debugSeatInfoEl) debugSeatInfoEl.textContent = text;
  });

  // Gelen Chat Mesajlarını İşle
  function handleChatMessage({ username, color, content }) {
    const trimmed = content.replace(/[\u200B-\u200D\uFEFF\u034F]/g, '').trim();
    if (!trimmed) return;

    const firstWord = trimmed.split(/\s+/)[0].toLocaleLowerCase('tr-TR');

    // !otur / !dersegir
    if (CONFIG.SIT_COMMANDS.includes(firstWord)) {
      const result = classroom.seatUser(username, color);
      if (result.ok) {
        logDebug(`${username} oturdu (${result.seatId})`);
      } else if (result.reason === 'full') {
        logDebug(`Sınıf dolu! ${username} oturamadı.`);
      }
      return;
    }

    // !kalk / !cikis
    if (CONFIG.LEAVE_COMMANDS.includes(firstWord)) {
      const removed = classroom.unseatUser(username);
      if (removed) {
        logDebug(`${username} koltuktan kalktı.`);
      }
      return;
    }

    // Komut olmayan normal mesajlar -> Oturan kullanıcıysa konuşma balonu göster
    if (!trimmed.startsWith('!')) {
      classroom.showSpeechBubble(username, trimmed);
    }
  }

  // Kick Chat Bağlantısını Başlat
  const kickClient = new KickChatClient({
    onMessage: handleChatMessage,
    onStatus: (state, text) => {
      const dotClass = `status-dot status-${state}`;
      if (hudStatusDotEl) hudStatusDotEl.className = dotClass;
      if (debugConnDotEl) debugConnDotEl.className = dotClass;
      if (debugConnTextEl) debugConnTextEl.textContent = text;
    },
  });
  kickClient.start();

  // =========================================================================
  // 7. DEBUG / TEST PANELİ (?debug=true)
  // =========================================================================
  if (CONFIG.DEBUG && debugPanelEl) {
    debugPanelEl.classList.remove('hidden');

    const SAMPLE_NAMES = [
      'Kaan',
      'Zeynep',
      'Mert_GG',
      'Elifsu',
      'BurakDev',
      'Deniz99',
      'AyseK',
      'EmreTV',
      'Selin',
      'YusufTR',
      'Ceren',
      'Oguzhan',
      'Nazli',
      'Kerem_07',
      'Buse',
      'Arda',
      'Tugba',
      'Furkan',
      'Irem',
      'Caner',
      'Melis',
      'Berkay',
      'Sude',
      'Hakan',
      'Ece',
      'Volkan',
      'Pelin',
      'Sinan',
    ];

    const SAMPLE_COLORS = [
      '#60a5fa',
      '#f472b6',
      '#4ade80',
      '#facc15',
      '#c084fc',
      '#fb923c',
      '#2dd4bf',
      '#f87171',
      '#a78bfa',
      '#34d399',
    ];

    const SAMPLE_MESSAGES = [
      'Hocam ses geliyor mu?',
      'Selamlar amfi tayfa!',
      'Not alan var mı arkadaşlar?',
      'Bugünkü ders çok iyi gidiyor!',
      'Arka sıradan selamlar :KEKW:',
      'Kahvemi aldım geldim, hazırız!',
      'Bu konu sınavda çıkar mı hocam?',
      'Mükemmel yayın, eline sağlık!',
      'Tahtayı biraz yaklaştırabilir miyiz?',
      'Uzun bir mesaj testi yapalım bakalım 80 karakterden uzun olunca üç nokta ile güzelce kesiliyor mu?',
    ];

    let randomNameSuffix = 1;

    document.getElementById('btn-toggle-debug').addEventListener('click', (e) => {
      const collapsed = debugBodyEl.classList.toggle('collapsed');
      e.target.textContent = collapsed ? '+' : '−';
    });

    document.getElementById('btn-sit-random').addEventListener('click', () => {
      const seated = new Set(classroom.getSeatedUsernames().map((n) => n.toLowerCase()));
      const availableNames = SAMPLE_NAMES.filter((n) => !seated.has(n.toLowerCase()));
      const username =
        availableNames.length > 0 ? pickRandom(availableNames) : `Ogrenci_${randomNameSuffix++}`;
      const color = pickRandom(SAMPLE_COLORS);

      handleChatMessage({ username, color, content: '!otur' });
    });

    document.getElementById('btn-msg-random').addEventListener('click', () => {
      const seated = classroom.getSeatedUsernames();
      if (seated.length === 0) {
        logDebug('Mesaj göndermek için önce en az 1 kullanıcı oturtun.');
        return;
      }
      const username = pickRandom(seated);
      const content = pickRandom(SAMPLE_MESSAGES);
      handleChatMessage({ username, color: '', content });
      logDebug(`${username}: ${content}`);
    });

    document.getElementById('btn-leave-random').addEventListener('click', () => {
      const seated = classroom.getSeatedUsernames();
      if (seated.length === 0) return;
      const username = pickRandom(seated);
      handleChatMessage({ username, color: '', content: '!kalk' });
    });

    document.getElementById('btn-clear-all').addEventListener('click', () => {
      classroom.clearAll();
      logDebug('Tüm sınıf boşaltıldı.');
    });

    document.getElementById('btn-toggle-bg').addEventListener('click', () => {
      const isNowTransparent = !document.body.classList.contains('bg-transparent');
      applyBackgroundMode(isNowTransparent ? 'transparent' : 'classroom');
      logDebug(`Arka plan: ${isNowTransparent ? 'Şeffaf' : 'Sınıf'}`);
    });

    document.getElementById('debug-sim-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const userInput = document.getElementById('sim-username');
      const msgInput = document.getElementById('sim-message');
      const username = userInput.value.trim() || 'TestOgrenci';
      const content = msgInput.value.trim();
      if (!content) return;

      handleChatMessage({
        username,
        color: pickRandom(SAMPLE_COLORS),
        content,
      });
      msgInput.value = '';
    });
  }
})();
