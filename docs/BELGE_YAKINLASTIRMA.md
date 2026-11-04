# Belge yüzeyi yakınlaştırması

## Plan ve davranış

1. Mevcut yazı boyutu ölçeğini koru; alt çubukta `Aa` ile ayırt et.
2. Belgeyi sabit genişlikli bir kâğıt yüzeyi olarak ele al. Ayrı sayfa kontrolü %25–%300 arasında kâğıt, boşluk, metin, tablo, görsel, matematik ve diyagramları birlikte ölçeklesin. Satırlar yalnızca yakınlaştırma nedeniyle yeniden akmasın. Uygulamanın araç çubukları büyümesin.
3. Precision trackpad sıkıştırma/açma hareketini Chromium'un Ctrl+wheel olayından al. Yalnızca belge alanında pasif olmayan dinleyici kullan; tarayıcı yakınlaştırmasını engelle. macOS için ⌘+tekerlek de kabul edilsin.
4. İşaretçi altındaki belge noktasını ölçek öncesi/sonrası geometrisinden hesapla. Boyamadan önce kaydırmayı düzelt. Kaydırma sınırına gelindiğinde tarayıcının doğal sınırlandırmasını kullan.
5. Normal iki parmak yatay/dikey kaydırmayı, momentum ve iç içe tablo/kod kaydırmasını tarayıcıya bırak. Belge kenarında geçmişe gitmeyi tetikleyen kaydırma taşmasını sınırla. Sağ tık/iki parmakla tıklama ve metin seçimine müdahale etme.
6. Eksi/artı, klavyeden erişilebilir sürgü, %100 düğmesi, genişliğe sığdırma ve ⌘/Ctrl + `+`, `−`, `0` sun. Genişliğe sığdırma pencere/yan panel boyutu değişirken yeniden hesaplansın; elle yakınlaştırma bu modu kapatsın.
7. Okuma, görsel düzenleme ve bölünmüş görünümde aynı ölçeği koru. Kaynak görünümünde sayfa kontrollerini devre dışı bırak. Diyalog açıkken belge kısayollarını ele geçirme. Markdown içeriğini, kaydetmeyi ve PDF/HTML çıktısını değiştirme. Ölçek oturum boyunca ortak bir görünüm tercihidir; ayar dosyasına yazılmaz.

## Uygulama

`src/hooks/useDocumentZoom.ts` olayları, yakınlaştırmayı, işaretçi sabitlemeyi ve genişliğe sığdırmayı yönetir. `.document-canvas` her iki yönde erişilebilir kaydırma alanı sağlar. `.document-sheet` üzerindeki CSS `zoom`, Electron'un Chromium motorunda yerleşimi ve düzenleme hedeflerini birlikte ölçekler. Yüzey sığarsa ortalanır, sığmazsa sol kenarı kaydırılarak erişilebilir kalır. Sayfa minimum yüksekliği 900 CSS pikselidir; Markdown içeriği tek sürekli yüzeyde uzar, baskı sayfalaması eklenmez.

## Doğrulama

Playwright: tüm yüzeyin ölçeklenmesi, sabit yazı ayarı/araç çubuğu, işaretçi sabitleme, doğal iki eksenli kaydırma, yeniden boyutlandırma sonrası sığdırma, sınırlar, kısayollar, yakınlaştırılmış görsel düzenleme ve bölünmüş görünüm. Electron testi ayrıca Chromium giriş kanalı üzerinden gerçek Ctrl+tekerlek teslimini ve uygulama zoom faktörünün 1 kalmasını doğrular.

Fiziksel trackpad üzerinde macOS ve Windows Precision Touchpad ile sıkıştırma, momentum, iki parmak tıklama ayrıca elle denenmelidir. Otomasyon fiziksel donanım kabul testi değildir. İşletim sistemindeki hareket tercihleri geçerlidir. Mission Control, sistem büyüteci ve işletim sisteminin uygulamaya aktarmadığı akıllı yakınlaştırma/iki parmak çift dokunma gibi hareketler uygulama tarafından yeniden atanmaz; %100 ve genişliğe sığdırma düğmeleri her zaman kullanılabilir.
