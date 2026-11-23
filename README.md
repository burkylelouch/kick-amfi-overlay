# Sanal Sınıf / Amfi — Kick.com OBS Overlay

Kick.com yayınlarınızda OBS **Browser Source (Tarayıcı Kaynağı)** olarak kullanabileceğiniz, izleyicilerin chat komutlarıyla kademeli bir üniversite amfisine oturup sohbet edebildiği interaktif web projesi.

## Özellikler
- **14 Kişilik 2 Sıralı Kademeli Amfi:** Arkadan öne doğru 2 kademeli sıra (`B: 8`, `A: 6`). Yeni gelen izleyiciler önce ön sıradaki boş koltuklara oturur.
- **Pixel-Art Karakterler:** 24×24 piksel ızgarasında rastgele üretilen keskin SVG pixel-art avatarlar (çeşitli ten/kıyafet renkleri, 7 farklı saç/şapka stili, gözlük/güneş gözlüğü/kulaklık/allık aksesuarları, göz kırpma ve konuşma animasyonları).
- **Akıllı Konuşma Balonları:**
  - Normal chat mesajları karakterin üstünde **3 saniye** görünür ve yumuşak `fade-out` ile kaybolur (yeni mesaj gelirse süre sıfırlanır, 80 karakterden uzun mesajlar `...` ile kesilir).
  - Yan yana oturan izleyiciler aynı anda mesaj attığında balonlar otomatik olarak birbirinden uzaklaşarak üst üste binmez.
  - Katman sıralaması sayesinde arka sıradaki kişiler ve balonları ön sıradakilerin önüne geçmez.
- **Chat Komutları:**
  - `!otur` veya `!dersegir` → Boş bir koltuğa pixel-art avatar ile oturur.
  - `!kalk`, `!cikis` veya `!çıkış` → Koltuktan kalkar.
- **AFK Sistemi:** 15 dakika boyunca mesaj yazmayan izleyiciler otomatik olarak koltuktan kaldırılır.
- **Kick Doğrudan WebSocket:** Ekstra backend gerektirmeden doğrudan Kick Pusher WebSocket üzerinden çalışır.
- **Şeffaf OBS Desteği:** `?bg=transparent` parametresi ile arka plan tamamen şeffaf yapılabilir.
- **Test Paneli:** `?debug=true` ile yayın açmadan tüm özellikleri tarayıcıda test edebilirsiniz.

---

## Çalıştırma (Localhost)
Proje harici bir paket kurulumu gerektirmeden yerleşik Node.js sunucusuyla `localhost` üzerinden çalışır.

1. Sunucuyu başlatın:
   - Terminalde:
     ```bash
     npm start
     ```
     *(veya doğrudan `node server.js`, Windows'ta `baslat.bat` dosyasına çift tıklayabilirsiniz. Farklı port için: `PORT=8080 node server.js`)*
2. Tarayıcınızda test paneliyle açın:
   ```
   http://localhost:3000/?debug=true
   ```
3. Sağ üstte açılan **Amfi Test Paneli** üzerinden kullanıcı oturtabilir, rastgele mesaj gönderebilir, manuel `!otur` / `!kalk` simülasyonu yapabilir ve şeffaf/sınıf arka planı arasında geçiş yapabilirsiniz.

---

## Kick Kanalına Bağlama ve Chatroom ID Bulma
İki yöntemden birini kullanabilirsiniz:

### Yöntem 1: Kanal Adı ile Otomatik
URL'ye `?channel=kanaladiniz` ekleyin (veya `app.js` içindeki `CONFIG.CHANNEL_NAME` alanına yazın).

### Yöntem 2: Manuel `chatroomId` (Önerilen — Cloudflare Engeline Takılmaz)
Tarayıcınızdan şu adresi açın:
```
https://kick.com/api/v2/channels/KANAL_ADINIZ
```
Açılan JSON verisinde `"chatroom": { "id": 1234567, ... }` kısmındaki sayıyı alın ve URL'ye `?chatroomId=1234567` olarak ekleyin (veya `app.js` içindeki `CONFIG.CHATROOM_ID` alanına yazın).

---

## URL Parametreleri
| Parametre | Örnek | Açıklama |
| --- | --- | --- |
| `channel` | `?channel=burak` | Kick kanal adı (otomatik `chatroom.id` çekmeye çalışır) |
| `chatroomId` | `?chatroomId=123456` | Doğrudan Kick Chatroom ID'si |
| `bg` | `?bg=transparent` | `transparent` (OBS şeffaf) veya `classroom` (varsayılan sınıf) |
| `debug` | `?debug=true` | Sağ üstte test panelini açar |
| `afk` | `?afk=15` | AFK süresi (dakika cinsinden, varsayılan `15`) |
| `bubbleMs` | `?bubbleMs=3000` | Konuşma balonu görünme süresi (ms, varsayılan `3000`) |
| `title` | `?title=YAYIN%20AMFİSİ` | Sınıf modundaki arka duvar tabelası yazısı |

Örnek OBS URL'si:
```
http://localhost:3000/?chatroomId=123456&bg=transparent
```

---

## OBS Studio'ya Ekleme Adımları
1. Önce yerel sunucuyu başlatın (`npm start` veya `baslat.bat`).
2. OBS Studio'da **Kaynaklar (Sources)** panelinden **+** simgesine tıklayın ve **Tarayıcı (Browser)** seçin.
3. Yeni kaynak oluşturun (ör. `Sanal Amfi`).
4. **Yerel dosya (Local file)** seçeneğini **işaretlemeyin** ve **URL** kısmına şuna benzer bir adres girin:
   ```
   http://localhost:3000/?chatroomId=CHATROOM_ID&bg=transparent
   ```
5. **Genişlik:** `1920`, **Yükseklik:** `1080` (veya sahnenize uygun boyut, ör. `1280x720`) olarak ayarlayın.
6. **Özel CSS (Custom CSS)** alanındaki varsayılan kodu silmeyin veya boş bırakın (`?bg=transparent` zaten şeffaflığı ayarlar).
7. **Tamam**'a basın. İzleyicileriniz chate `!otur` yazdığında amfide belirmeye başlayacaklardır!
