<div align="center">

# Folio

**Markdown belgelerini kod bilmeden oku, düzenle ve yanında taşı.**

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Türkçe](https://img.shields.io/badge/lang-T%C3%BCrk%C3%A7e-red.svg)](README.tr.md)

[![Masaüstü doğrulama](https://github.com/onurcankaraman/folio-markdown/actions/workflows/desktop.yml/badge.svg)](https://github.com/onurcankaraman/folio-markdown/actions/workflows/desktop.yml)
![Platformlar](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-45-47848F.svg?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)

[Özellikler](#özellikler) · [Başlarken](#başlarken) · [Geliştirme](#geliştirme) · [Testler](#testler) · [Paketleme](#paketleme) · [Katkı rehberi](CONTRIBUTING.tr.md)

![Folio masaüstü uygulaması](docs/screenshots/folio-packaged.png)

</div>

Yerel dosyalarla çalışan masaüstü Markdown okuyucu ve görsel düzenleyici. Electron, React ve TypeScript ile geliştirildi. Bir hesap veya uygulama sunucusu gerektirmez.

> [!NOTE]
> **Proje durumu:** Çalışan masaüstü uygulaması ve üç platform için yerel paketler mevcuttur. Tam üretim kabulü henüz tamamlanmamıştır. Doğrulanan işlevler ve açık maddeler [teslimat kontrolünde](docs/TESLIMAT_KONTROLU.md) izlenir.

## İçindekiler

- [Özellikler](#özellikler)
- [Ekran görüntüleri](#ekran-görüntüleri)
- [Başlarken](#başlarken)
- [Geliştirme](#geliştirme)
- [Testler](#testler)
- [Paketleme](#paketleme)
- [MCP sunucusu](#mcp-sunucusu)
- [Veri güvenliği ve gizlilik](#veri-güvenliği-ve-gizlilik)
- [Taşınabilir veri klasörü](#taşınabilir-veri-klasörü)
- [Bilinen kullanım sınırları](#bilinen-kullanım-sınırları)
- [Kaynak düzeni](#kaynak-düzeni)
- [Belgeler](#belgeler)
- [Bağımlılıklar ve lisans](#bağımlılıklar-ve-lisans)

## Özellikler

- **Dört görünüm:** okuma, doğrudan görsel düzenleme, gerçek Markdown kaynağı ve bölünmüş görünüm.
- **Metin biçimleri:** başlıklar, kalın/italik/üstü çizili, listeler, görev kutuları, alıntılar ve kod blokları.
- **Tablolar:** satır/sütun ekleme, silme, taşıma ve hizalama; TSV yapıştırma; CSV/TSV önizlemeli içe ve dışa aktarma.
- **Görseller ve bağlantılar:** dosyadan veya panodan görsel, göreli varlık klasörü ve yerel bağlantılar.
- **Matematik:** MathLive ile görsel giriş, boyut seçmeli matris/determinant, sembol/şablon paleti ve KaTeX ile çizim; LaTeX/MathML kopyalama, çevrimdışı SVG/PNG çıktısı, PNG ölçek ve saydamlık seçenekleri.
- **Diyagramlar:** 16 Mermaid türü için tuval veya form/veri tabanlı düzenleme; canlı önizleme, kaynak ve SVG çıktısı.
- **Zengin bloklar:** dipnotlar, bilgi kutuları, görsel gövde düzenlemeli açılır bölümler ve YAML özellik paneli.
- **Sekmeler ve oturum:** sabitleme, sıralama, kapatılan sekmeyi açma ve kaydedilmiş oturumu geri yükleme.
- **Çalışma alanı:** klasör ağacı, yeni dosya/klasör, yeniden adlandırma, çöp kutusu ve klasörde toplu arama/değiştirme.
- **Güvenli kayıt:** gerçek dosyada çakışma denetimi, atomik kaydetme, üç yönlü birleştirme, kurtarma taslakları ve kayıt geçmişi.
- **Kodlamalar:** UTF-8/BOM ve UTF-16; geçersiz UTF-8 için kodlama seçimi; mevcut satır sonlarını koruma.
- **Dışa aktarma:** PDF, fontları gömülü bağımsız HTML ve görselleri içeren ZIP. ZIP içe aktarmada yol, boyut, çakışma ve CRC kontrolleri.
- **Arayüz:** Türkçe/İngilizce ana arayüz, açık/koyu/sistem teması, yakınlaştırma ve odak modu; doğrulama ve uygulama önizlemeli ayar dosyası içe aktarma.

Bu liste temel işlevleri anlatır; her özelliğin bütün gelişmiş seçeneklerini kapsadığı iddiası değildir. Özellikle diyagramların ileri seçenekleri için teslimat kontrolünü okuyun.

## Ekran görüntüleri

| Açık                                                 | Koyu                                                |
| ---------------------------------------------------- | --------------------------------------------------- |
| ![Folio açık tema](docs/screenshots/folio-light.png) | ![Folio koyu tema](docs/screenshots/folio-dark.png) |

## Başlarken

İmzalı bir genel yayın henüz yoktur. GitHub Actions çalışmaları başarılı olduğunda platform paketleri ilgili çalışmanın **Artifacts** bölümünden alınabilir.

| Platform              | `release/` içindeki çıktı                                                      |
| --------------------- | ------------------------------------------------------------------------------ |
| macOS (Apple Silicon) | `mac-arm64/Folio.app`, `Folio-<sürüm>-mac-arm64.dmg` ve uygulamanın ZIP paketi |
| Windows x64           | Setup ve Portable `.exe`                                                       |
| Linux x64             | AppImage ve DEB                                                                |

> [!WARNING]
> Yerel paket yayıncı sertifikasıyla imzalanmamıştır ve Apple noter onayı yoktur. İmzalı genel dağıtım için yayıncıya ait sertifikalar gerekir. Sistem güvenlik ayarlarını küresel olarak kapatmayın.

## Geliştirme

Node.js 24 veya üzeri ve npm gerekir. Depoyu klonlayıp kilit dosyasındaki sürümlerle kurun:

```bash
git clone https://github.com/onurcankaraman/folio-markdown.git
cd folio-markdown
npm ci
npm run desktop
```

Yalnız arayüz önizlemesi:

```bash
npm run dev
```

Tarayıcı önizlemesi bir masaüstü uygulamasının dosya yetkilerine sahip değildir. Kaydetme dosya indirme olarak çalışır; yerel klasör, sürüm geçmişi ve dosya izleme için Electron uygulaması kullanılmalıdır. Önizlemede bu fark durum çubuğunda gösterilir.

Üretim derlemesini yerel olarak çalıştırma:

```bash
npm run build
npm start
```

## Testler

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

Uçtan uca test komutu önce üretim derlemesini oluşturur. Testler geçici dosyalar ve ayrılmış bir Electron profili kullanır. macOS üzerinde oluşturulan gerçek uygulama paketi ayrıca kontrol edilebilir:

```bash
node scripts/smoke-packaged.mjs
```

Ayrıntılar [test raporunda](docs/TEST_RAPORU.md), formül kapsamı [matematik envanterinde](docs/MATEMATIK_DESTEGI.md) bulunur.

## Paketleme

```bash
node scripts/icons.mjs
npm run package:mac
npm run package:win
npm run package:linux
node scripts/release-metadata.mjs
```

Diğer mimari için doğrudan `npx electron-builder --mac --x64 --publish never` gibi bir hedef kullanılır. Platform paketleri esas olarak kendi işletim sistemlerinde oluşturulmalıdır. GitHub Actions dosyası platform/mimari işleri içerir. `main` güncellemeleri, sürüm etiketleri ve elle başlatılan çalışmalar doğrulama ve paketleme akışını tetikler.

İmzalama, noter onayı ve yayın adresi yönetimi için [yayınlama rehberini](docs/YAYINLAMA.md) okuyun.

## MCP sunucusu

Folio, yapay zekâ asistanlarının tek bir klasördeki Markdown dosyalarıyla uygulamanın güvenli kayıt kurallarını kullanarak çalışabilmesi için yerel bir [MCP](https://modelcontextprotocol.io) sunucusu içerir. Sunucu kaynak kodundan çalıştırılır ve uygulama paketlerine eklenmez.

```bash
npm ci
npm run build:main
node dist-electron/mcp.js /notlar/klasoru
```

Örnek istemci yapılandırması:

```json
{
  "mcpServers": {
    "folio": {
      "command": "node",
      "args": ["/yol/folio-markdown/dist-electron/mcp.js", "/notlar/klasoru"]
    }
  }
}
```

| Araç               | Ne yapar                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `list_documents`   | Klasördeki Markdown dosyalarını boyutlarıyla listeler                                      |
| `read_document`    | Bir dosyanın kaynağını, kodlamasını ve özetini döndürür                                    |
| `search_documents` | Satır numaralarıyla düz metin araması yapar                                                |
| `write_document`   | Yeni dosya oluşturur veya `baseHash` diskteki dosyayla eşleşirse mevcut dosyayı değiştirir |

- Yalnız klasör içindeki `.md` ve `.markdown` dosyaları kullanılabilir. Dışarıyı gösteren yollar ve sembolik bağlantılar reddedilir.
- Gizli klasörler, `node_modules`, `dist` ve `release` atlanır; 5 MiB üzerindeki dosyalar okunmaz.
- Yazma işlemi atomiktir, dosyanın kodlamasını ve CRLF satır sonlarını korur ve okunduktan sonra değişmiş bir dosyanın üzerine yazmaz.

## Veri güvenliği ve gizlilik

- Dosyanın özgün kaynağı saklanır. Değişmeyen üst düzey bloklar yeniden yazılmaz; değişen bloklar kontrollü olarak üretilir. Markdown → HTML → Markdown dönüşümüyle bütün belgeyi yeniden kaydetme yapılmaz. Tanınmayan içerikler kaynakları korunarak açılır.
- Kayıt, aynı dizindeki geçici dosyaya yazma, dayanıklı aktarım, son disk özeti denetimi ve atomik değiştirme kullanır. Kaydetme başarısız olduğunda belge açık kalır. İşletim sistemi düzeyinde koşullu değiştirme desteği olmayan dosya sistemlerinde son kontrol ile yeniden adlandırma arasında çok dar bir yarış aralığı kalabilir; ağ dosya sistemleri için yerel disk düzeyinde garanti verilmez.
- Otomatik kurtarma taslağı ile gerçek dosyaya otomatik kaydetme ayrı işlemlerdir. Gerçek otomatik kaydet varsayılan kapalıdır. Taslaklar 2 saniyelik boşta kalma süresinden sonra, sürekli yazımda 10 saniyede bir korunur. Taslaklar açık metindir; uygulama düzeyinde şifreleme iddia edilmez.
- Renderer'da Node erişimi kapalıdır; sandbox ve context isolation açıktır. Diyagramlar masaüstünde ayrı, ayrıcalıksız bir pencerede çizilir; süre aşımında bu pencere kapatılır. Belge içinden kod çalıştırılmaz. Uzak görseller varsayılan yüklenmez. Güncelleme kontrolü kullanıcı eylemi olmadan ağ isteği başlatmaz.

## Taşınabilir veri klasörü

- Windows portable paketi, kendi bulunduğu klasörün altındaki `data/` klasörünü kullanır.
- macOS'ta `.app` dosyasının yanına, Linux'ta çalıştırılabilir dosyanın yanına `portable.json` eklemek taşınabilir veri modunu etkinleştirir. Dosyanın içeriği `{}` olabilir.
- ZIP'ten çıkarılmış `.app` kendi başına ayarların da taşınabilir olduğu anlamına gelmez; işaretçi gerekir.
- `FOLIO_DATA_DIR` ortam değişkeni, portable işaretçisi yokken özel bir veri klasörü seçmeye yarar. Paket testleri bu şekilde kullanıcı profilinden ayrılır.
- Yazılamayan veri konumunda klasör seçme veya geçici oturum seçenekleri gösterilir; sessizce başka bir profile geçilmez.

İşletim sisteminin geçici dosyaları ve kayıtları nedeniyle “hiç iz bırakmaz” iddiası yoktur.

## Bilinen kullanım sınırları

| Alan                   | Sınır                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Yerel Markdown dosyası | 60 MiB açılış sınırı. Büyük belgeler için tüm performans hedefleri henüz doğrulanmadı.                         |
| Görsel                 | Dosya başına 25 MiB                                                                                            |
| Görsel diyagram modeli | 500 düğüm, 1.000 bağlantı veya 2.000 veri satırı; 256 KiB kaynak                                               |
| Formül                 | 32 KiB. Güvenilmeyen HTML/bağlantı komutları kapalı.                                                           |
| ZIP içe aktarma        | 100 MiB sıkıştırılmış, 500 MiB açılmış içerik, 10.000 dosya. Çok parçalı/ZIP64 ve şifreli arşivler reddedilir. |
| ZIP çıktı              | 40 MiB toplam kaynak/varlık sınırı. Aşımda sessizce eksik paket üretilmez.                                     |
| Klasör araması         | 2.000 dosya ve 50 MiB toplam tarama; dosya başına 5 MiB                                                        |

## Kaynak düzeni

```text
electron/          Dosya, kayıt, güvenlik, paket, güncelleme ve platform köprüsü
src/core/          Markdown kaynak koruma, diyagram modelleri, arama ve geçmiş
src/components/    Görsel editörler ve belge araçları
src/App.tsx        Uygulama yerleşimi ve belge oturumlarının koordinasyonu
tests/             Çekirdek, dosya, paket ve gerçek kullanıcı akışları
build/             Uygulama simgesi ve platform simgeleri
scripts/           Simge, paket kontrolü ve yayın meta verisi üretimi
docs/              Teslimat durumu, yayın rehberi ve ekran görüntüleri
```

## Belgeler

- [Katkı rehberi](CONTRIBUTING.tr.md)
- [Teslimat kontrolü](docs/TESLIMAT_KONTROLU.md)
- [Test raporu](docs/TEST_RAPORU.md)
- [Matematik desteği](docs/MATEMATIK_DESTEGI.md)
- [Yayınlama rehberi](docs/YAYINLAMA.md)

## Bağımlılıklar ve lisans

Üçüncü taraf bileşen bildirimleri `node scripts/release-metadata.mjs` ile üretilir; lisans metinleri uygulama paketlerine eklenir. Üretilen dosyalar Git geçmişine alınmaz. Projenin kendi kaynak kodu için henüz bir açık kaynak lisansı seçilmemiştir.
