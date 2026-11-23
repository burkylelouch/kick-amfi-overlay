# Sanal Sınıf / Amfi — Kick.com OBS Overlay

Kick.com yayınlarınızda OBS **Browser Source (Tarayıcı Kaynağı)** olarak kullanabileceğiniz, izleyicilerin chat komutlarıyla kademeli bir üniversite amfisine oturup sohbet edebildiği interaktif web projesi.

## Özellikler
- **14 Kişilik Kademeli Amfi:** Arkadan öne doğru 2 kademeli sıra (`B: 8`, `A: 6`).
- **Chat Komutları:**
  - `!otur` veya `!dersegir` → Rastgele boş bir koltuğa sevimli bir SVG avatar ile oturur.
  - Normal chat mesajları → Karakterin kafasının üstünde **3 saniye** görünen ve yumuşak `fade-out` ile kaybolan konuşma balonu çıkar (yeni mesaj gelirse süre sıfırlanır, 80 karakterden uzun mesajlar `...` ile kesilir).
  - `!kalk`, `!cikis` veya `!çıkış` → Koltuktan kalkar.
- **AFK Sistemi:** 15 dakika boyunca mesaj yazmayan izleyiciler otomatik olarak koltuktan kaldırılır.
- **Kick Doğrudan WebSocket:** Ekstra backend gerektirmeden doğrudan Kick Pusher WebSocket üzerinden çalışır.
- **Şeffaf OBS Desteği:** `?bg=transparent` parametresi ile arka plan tamamen şeffaf yapılabilir.
- **Test Paneli:** `?debug=true` ile yayın açmadan tüm özellikleri tarayıcıda test edebilirsiniz.

---

## Hızlı Test (Tarayıcıda)
1. Klasördeki `index.html` dosyasını tarayıcınızda açın ve adres çubuğunun sonuna `?debug=true` ekleyin:
   ```
   index.html?debug=true
   ```
2. Sağ üstte açılan **Amfi Test Paneli** üzerinden kullanıcı oturtabilir, rastgele mesaj gönderebilir, manuel `!otur` / `!kalk` simülasyonu yapabilir ve şeffaf/sınıf arka planı arasında geçiş yapabilirsiniz.

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
file:///C:/Users/burak/Desktop/yayın%20oyunu/index.html?chatroomId=123456&bg=transparent
```

---

## OBS Studio'ya Ekleme Adımları
1. OBS Studio'da **Kaynaklar (Sources)** panelinden **+** simgesine tıklayın ve **Tarayıcı (Browser)** seçin.
2. Yeni kaynak oluşturun (ör. `Sanal Amfi`).
3. **Yerel dosya (Local file)** seçeneğini **işaretlemeyin** (URL parametreleri kullanabilmek için URL alanına `file:///` yolu yazmak daha kolaydır) **veya** `app.js` içindeki `CONFIG` değerlerini düzenleyip *Yerel dosya* seçerek `index.html` dosyasını gösterin.
4. **URL** kısmına şuna benzer bir adres girin:
   ```
   file:///C:/Users/burak/Desktop/yayın%20oyunu/index.html?chatroomId=CHATROOM_ID&bg=transparent
   ```
5. **Genişlik:** `1920`, **Yükseklik:** `1080` (veya sahnenize uygun boyut, ör. `1280x720`) olarak ayarlayın.
6. **Özel CSS (Custom CSS)** alanındaki varsayılan kodu silmeyin veya boş bırakın (`?bg=transparent` zaten şeffaflığı ayarlar).
7. **Tamam**'a basın. İzleyicileriniz chate `!otur` yazdığında amfide belirmeye başlayacaklardır!
