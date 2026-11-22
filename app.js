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

    // Kick Pusher WebSocket adresi
    PUSHER_WS_URL:
      urlParams.get('wsUrl') ||
      'wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=8.4.0-rc2&flash=false',

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

    // Kademeli amfi sırası düzeni (arkadan öne toplam 26 koltuk)
    ROWS: [
      { label: 'D', seats: 8, width: '98%' },
      { label: 'C', seats: 7, width: '90%' },
      { label: 'B', seats: 6, width: '81%' },
      { label: 'A', seats: 5, width: '71%' },
    ],
  };

  // =========================================================================
  // 2. YARDIMCI FONKSİYONLAR
  // =========================================================================

  /**
   * Kick mesajındaki [emote:12345:KEKW] ifadelerini okunaklı hale getirir
   * ve uzun mesajları 80 karakterde "..." ile keser.
   */
  function formatChatMessage(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') return '';

    const cleaned = rawContent
      .replace(/\[emote:\d+:([^\]]+)\]/g, ':$1:')
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
  // 3. SEVİMLİ SVG AVATAR ÜRETİCİSİ
  // =========================================================================
  const AvatarGenerator = (() => {
    const SKIN_TONES = ['#FFDFC4', '#F5CBA7', '#E6B08A', '#C68642', '#8D5524'];
    const HAIR_COLORS = [
      '#2C222B',
      '#4A312C',
      '#7B4B2A',
      '#D4A359',
      '#B83B2A',
      '#3B5998',
      '#9B5DE5',
      '#EC4899',
      '#E2E8F0',
    ];
    const SHIRT_COLORS = [
      '#3B82F6',
      '#EF4444',
      '#10B981',
      '#F59E0B',
      '#8B5CF6',
      '#EC4899',
      '#14B8A6',
      '#F97316',
      '#6366F1',
      '#84CC16',
    ];
    const HAIR_STYLES = ['short', 'bob', 'spiky', 'bun', 'curly', 'beanie'];
    const ACCESSORIES = ['none', 'none', 'none', 'glasses', 'headphones', 'blush'];

    function randomSpec() {
      return {
        skin: pickRandom(SKIN_TONES),
        hairColor: pickRandom(HAIR_COLORS),
        shirtColor: pickRandom(SHIRT_COLORS),
        hairStyle: pickRandom(HAIR_STYLES),
        accessory: pickRandom(ACCESSORIES),
      };
    }

    function renderHairBack(style, color) {
      if (style === 'bob') {
        return `<rect x="24" y="24" width="52" height="38" rx="18" fill="${color}" />`;
      }
      if (style === 'bun') {
        return `
          <circle cx="50" cy="11" r="11" fill="${color}" />
          <ellipse cx="50" cy="30" rx="26" ry="20" fill="${color}" />
        `;
      }
      if (style === 'curly') {
        return `
          <circle cx="26" cy="28" r="10" fill="${color}" />
          <circle cx="74" cy="28" r="10" fill="${color}" />
          <circle cx="24" cy="40" r="9" fill="${color}" />
          <circle cx="76" cy="40" r="9" fill="${color}" />
        `;
      }
      return '';
    }

    function renderHairFront(style, color) {
      switch (style) {
        case 'short':
          return `
            <path d="M26 36 C26 16, 74 16, 74 36 C68 27, 58 24, 50 25 C40 24, 31 28, 26 36 Z" fill="${color}" />
          `;
        case 'bob':
          return `
            <path d="M24 38 C24 15, 76 15, 76 38 C70 28, 60 25, 48 27 C36 28, 29 32, 24 38 Z" fill="${color}" />
          `;
        case 'spiky':
          return `
            <path d="M26 35 L29 19 L39 24 L48 12 L57 23 L68 16 L73 35 C65 27, 35 27, 26 35 Z" fill="${color}" />
          `;
        case 'bun':
          return `
            <path d="M27 34 C29 17, 71 17, 73 34 C65 26, 35 26, 27 34 Z" fill="${color}" />
          `;
        case 'curly':
          return `
            <circle cx="34" cy="21" r="9" fill="${color}" />
            <circle cx="46" cy="18" r="10" fill="${color}" />
            <circle cx="58" cy="19" r="10" fill="${color}" />
            <circle cx="68" cy="23" r="8" fill="${color}" />
          `;
        case 'beanie':
          return `
            <path d="M25 33 C25 14, 75 14, 75 33 Z" fill="${color}" />
            <rect x="23" y="29" width="54" height="8" rx="4" fill="${color}" filter="brightness(0.85)" />
            <circle cx="50" cy="13" r="5" fill="${color}" />
          `;
        default:
          return '';
      }
    }

    function renderAccessory(acc) {
      if (acc === 'glasses') {
        return `
          <g stroke="#1e293b" stroke-width="2.4" fill="rgba(255,255,255,0.22)">
            <circle cx="40" cy="43" r="6.5" />
            <circle cx="60" cy="43" r="6.5" />
            <line x1="46.5" y1="43" x2="53.5" y2="43" />
          </g>
        `;
      }
      if (acc === 'headphones') {
        return `
          <g>
            <path d="M23 42 C23 15, 77 15, 77 42" fill="none" stroke="#334155" stroke-width="4.5" stroke-linecap="round" />
            <rect x="18" y="36" width="8" height="16" rx="4" fill="#ef4444" stroke="#1e293b" stroke-width="1.5" />
            <rect x="74" y="36" width="8" height="16" rx="4" fill="#ef4444" stroke="#1e293b" stroke-width="1.5" />
          </g>
        `;
      }
      if (acc === 'blush') {
        return `
          <ellipse cx="34" cy="49" rx="4.5" ry="2.5" fill="#fb7185" opacity="0.55" />
          <ellipse cx="66" cy="49" rx="4.5" ry="2.5" fill="#fb7185" opacity="0.55" />
        `;
      }
      return '';
    }

    function createAvatarSVG(spec = randomSpec()) {
      const { skin, hairColor, shirtColor, hairStyle, accessory } = spec;
      return `
        <svg class="avatar-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          ${renderHairBack(hairStyle, hairColor)}

          <!-- Gövde / Sweatshirt -->
          <path d="M20 96 C20 71, 32 63, 50 63 C68 63, 80 71, 80 96 Z" fill="${shirtColor}" stroke="#1e2233" stroke-width="2.5" />
          <!-- Yaka detayı -->
          <path d="M40 65 Q50 74 60 65" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="3" stroke-linecap="round" />
          <!-- Boyun -->
          <rect x="44" y="55" width="12" height="12" rx="5" fill="${skin}" />

          <!-- Kulaklar -->
          <circle cx="27" cy="44" r="5" fill="${skin}" />
          <circle cx="73" cy="44" r="5" fill="${skin}" />

          <!-- Kafa -->
          <rect x="28" y="21" width="44" height="42" rx="20" fill="${skin}" stroke="#1e2233" stroke-width="2.2" />

          <!-- Gözler -->
          <g class="avatar-eyes">
            <circle cx="40" cy="43" r="3.2" fill="#1e2233" />
            <circle cx="60" cy="43" r="3.2" fill="#1e2233" />
            <circle cx="41.1" cy="41.8" r="1.1" fill="#ffffff" />
            <circle cx="61.1" cy="41.8" r="1.1" fill="#ffffff" />
          </g>

          <!-- Ağız (Normal gülümseme) -->
          <path class="avatar-mouth-idle" d="M44 52 Q50 56.5 56 52" fill="none" stroke="#1e2233" stroke-width="2.3" stroke-linecap="round" />
          <!-- Ağız (Konuşurken) -->
          <ellipse class="avatar-mouth-talk" cx="50" cy="53" rx="4.2" ry="3.2" fill="#1e2233" />

          ${renderHairFront(hairStyle, hairColor)}
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
  // 5. KICK CHAT BAĞLANTISI (PUSHER WEBSOCKET)
  // =========================================================================
  class KickChatClient {
    constructor({ onMessage, onStatus }) {
      this.onMessage = onMessage;
      this.onStatus = onStatus;
      this.ws = null;
      this.chatroomId = null;
      this.reconnectAttempts = 0;
      this.pingInterval = null;
      this.reconnectTimer = null;
      this.stopped = false;
    }

    async start() {
      if (CONFIG.CHATROOM_ID) {
        this.chatroomId = CONFIG.CHATROOM_ID;
        this.connectWebSocket();
        return;
      }

      if (!CONFIG.CHANNEL_NAME) {
        this.setStatus('idle', 'Kanal ayarlanmadı (?channel=... veya ?chatroomId=...)');
        logDebug('Bağlantı için ?channel=kanaladi veya ?chatroomId=12345 girin.');
        return;
      }

      this.setStatus('connecting', `${CONFIG.CHANNEL_NAME} kanalı bulunuyor...`);
      try {
        const res = await fetch(
          `https://kick.com/api/v2/channels/${encodeURIComponent(CONFIG.CHANNEL_NAME)}`
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const id = data?.chatroom?.id;
        if (!id) {
          throw new Error('chatroom.id bulunamadı');
        }
        this.chatroomId = String(id);
        logDebug(`Chatroom ID otomatik alındı: ${this.chatroomId}`);
        this.connectWebSocket();
      } catch (err) {
        this.setStatus('error', 'API engellendi — chatroomId gerekli');
        logDebug(
          `Kick API alınamadı (${err.message}). Cloudflare engeli varsa URL'ye ?chatroomId=ID ekleyin.`
        );
      }
    }

    connectWebSocket() {
      if (this.stopped || !this.chatroomId) return;

      this.cleanupSocket();
      this.setStatus('connecting', `Bağlanıyor (Oda: ${this.chatroomId})...`);

      try {
        this.ws = new WebSocket(CONFIG.PUSHER_WS_URL);
      } catch (err) {
        this.setStatus('error', 'WebSocket başlatılamadı');
        this.scheduleReconnect();
        return;
      }

      this.ws.addEventListener('open', () => {
        logDebug('Pusher WebSocket açıldı.');
        this.reconnectAttempts = 0;

        // Periyodik ping gönder (OBS Chromium bağlantıyı uyutmasın)
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
          }
        }, 30000);
      });

      this.ws.addEventListener('message', (event) => {
        this.handleRawFrame(event.data);
      });

      this.ws.addEventListener('close', () => {
        this.setStatus('error', 'Bağlantı koptu, yeniden bağlanılıyor...');
        this.scheduleReconnect();
      });

      this.ws.addEventListener('error', () => {
        logDebug('WebSocket bağlantı hatası oluştu.');
      });
    }

    handleRawFrame(rawData) {
      let frame;
      try {
        frame = JSON.parse(rawData);
      } catch {
        return;
      }

      const eventName = frame.event;

      if (eventName === 'pusher:connection_established') {
        const channel = `chatrooms.${this.chatroomId}.v2`;
        this.ws.send(
          JSON.stringify({
            event: 'pusher:subscribe',
            data: { auth: '', channel },
          })
        );
        logDebug(`Kanala abone olunuyor: ${channel}`);
        return;
      }

      if (eventName === 'pusher_internal:subscription_succeeded') {
        this.setStatus('connected', `Bağlı (Oda: ${this.chatroomId})`);
        logDebug('Kick chat bağlantısı hazır!');
        return;
      }

      if (eventName === 'pusher:ping') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        }
        return;
      }

      if (eventName === 'App\\Events\\ChatMessageEvent') {
        let payload;
        try {
          payload = typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data;
        } catch {
          return;
        }

        const username = payload?.sender?.username;
        const color = payload?.sender?.identity?.color || '';
        const content = payload?.content || '';

        if (username && typeof content === 'string') {
          this.onMessage({ username, color, content });
        }
      }
    }

    scheduleReconnect() {
      this.cleanupSocket();
      if (this.stopped) return;

      this.reconnectAttempts += 1;
      const delay = Math.min(30000, 2000 * Math.pow(2, this.reconnectAttempts - 1));
      logDebug(`${Math.round(delay / 1000)} sn sonra yeniden bağlanılacak...`);
      this.reconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
    }

    cleanupSocket() {
      clearInterval(this.pingInterval);
      clearTimeout(this.reconnectTimer);
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // yoksay
        }
        this.ws = null;
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
    const trimmed = content.trim();
    if (!trimmed) return;

    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();

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
