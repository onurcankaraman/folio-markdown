# Yayınlama ve platform doğrulaması

## Yerel paket ile imzalı dağıtımın ayrımı

Paket üretilmesi, işletim sistemi doğrulaması ve yayıncı imzası üç ayrı işlemdir. Bu projede yerel macOS ARM64 paketi oluşturulup çalıştırılarak denetlenir. Apple Developer ID ve Windows yayıncı sertifikaları kaynak koduna eklenmez.

Bu çalışma ortamında `security find-identity -v -p codesigning` sonucu geçerli kimlik bulunmadığını gösterdi. Dolayısıyla üretilen yerel paketler imzalı genel dağıtım olarak sunulamaz.

## macOS

1. Yayıncıya ait Developer ID Application sertifikasını güvenli CI sertifika deposuna ekleyin.
2. electron-builder'ın desteklediği `CSC_LINK` / `CSC_KEY_PASSWORD` veya Keychain kimliğini kullanın. Değerleri depoya, `.env` örneğine veya günlüklere yazmayın.
3. Apple noter onayını yayıncıya ait güvenli kimliklerle yapılandırın.
4. İmzalı `.app`, DMG ve ZIP üretin; imza ve noter onayını gerçek paket üzerinde doğrulayın.
5. Hem Apple Silicon hem Intel paketini desteklenen macOS sürümlerinde açın. Karantina ve dosyaya çift tıklama akışını da kontrol edin.

Yerel test paketleri için `CSC_IDENTITY_AUTO_DISCOVERY=false` kullanılabilir. Bu, genel dağıtım onayı değildir.

## Windows

- `nsis` kurulum ve `portable` hedefleri ayrıdır; adları Setup ve Portable son ekleriyle çakışmaz.
- Sertifikayı veya güvenilir imzalama hizmetini CI gizli değerleriyle bağlayın.
- İmzalı yayıncı adı ile güncelleme yapılandırmasındaki yayıncı adı eşleşmelidir.
- x64 ve ARM64 üzerinde kurulum, kullanıcı bazlı yetkiler, kaldırma, dosya ilişkisi ve USB benzeri portable konum kontrolü gerekir.
- Varsayılan uygulama seçimi işletim sisteminin kullanıcı tercihine bırakılır.

## Linux

- AppImage ve DEB hedefleri vardır. DEB paketindeki ana sayfa alanı, pakete eklenen `file:///opt/Folio/resources/README.md` çevrimdışı rehberini gösterir; herkese açık bir proje sitesi uydurulmaz. x64/ARM64 ve desteklenen Ubuntu sürümleri üzerinde ayrı doğrulanmalıdır.
- `.deb` güncellemeleri sistem paket yöneticisi/yeni paket üzerinden yürütülür. Portable/AppImage dağıtımında çalışan dosya sessizce değiştirilmez.
- X11 ve Wayland testleri, yazdırma ve sistem dosya diyalogları platform kontrolüne dahildir.

## Güncelleme kanalı

Uygulama başlangıçta bir yayın sunucusuna bağlanmaz. Hakkında/Güncellemeler ekranında kullanıcı bir HTTPS kanalı seçip denetim başlatabilir. Yayıncının yapılandırdığı `FOLIO_UPDATE_URL` aynı amaçla kullanılabilir.

Kurulu macOS/Windows paketinde electron-updater yapılandırması ve imzalı yayın kimliği gerekir. Bunlar yokken arayüz güncelleme varmış veya uygulama güncelmiş gibi sonuç üretmez. Windows'ta yayıncı kimliği olmayan paketlerin otomatik güncellenmesi engellenir. Portable ve Linux dağıtımları için yeni paketi edinme yöntemi kullanılır.

Kullanıcı indirme ve kurulum eylemlerini ayrı başlatır. Kurulum öncesinde açık belgelerin güvenle kaydedilmesi gerekir. Yayın adresinden farklı bir kaynağa yönlendiren indirmeler ağ izinleri nedeniyle reddedilebilir; CDN kullanılan kanallar ayrıca denetlenmelidir.

## Sürüm yayınlama

`.github/workflows/release.yml`, `main` dalında `package.json` değiştiğinde çalışır. `version` alanı için `v<sürüm>` etiketi yoksa altı platform/mimari paketini üretir, SHA256SUMS, SBOM ve lisans bildirimlerini ekler, ardından etiketi ve GitHub sürümünü oluşturur. Etiket zaten varsa hiçbir şey yayınlanmaz. `1.1.0-beta.1` gibi tireli sürümler ön sürüm olarak işaretlenir.

1. `npm version <patch|minor|major> --no-git-tag-version` ile `package.json` ve `package-lock.json` sürümünü birlikte güncelleyin.
2. Değişikliği bir pull request ile `main` dalına alın.
3. Mevcut sürümü yeniden denemek için iş akışı Actions sekmesinden elle de başlatılabilir.

Paketler imzasız üretilir ve sürüme `latest*.yml` güncelleme beslemeleri eklenmez; aynı adlı x64 ve ARM64 beslemeleri birbirinin üzerine yazacağı için bu dosyalar imzalı yayın yapılandırmasıyla birlikte ele alınmalıdır.

## CI ve meta veriler

`.github/workflows/desktop.yml`, Windows/macOS/Linux ve x64/ARM64 işleri tanımlar. Kaynak depoya gönderilip ilgili işler çalıştırılmadan CI başarılı olarak raporlanamaz. Kontrol edilen [GitHub runner tablosu](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) yapılandırılan mimarileri listeler; kullanılabilirlik ve hesap kotaları ayrıca geçerlidir.

Her yayında:

- Kaynak derlemesi, çekirdek testleri ve kullanıcı akışı testleri çalıştırılmalıdır.
- Platform paketlerinin gerçekten açıldığı doğrulanmalıdır.
- `scripts/release-metadata.mjs` ile bağımlılık envanteri, lisans metinleri ve SHA-256 özetleri üretilmelidir.
- Uygulama sürümü ile paket adları eşleşmelidir.
- İmza anahtarları ve özel erişim bilgileri pakette bulunmamalıdır.

Güncelleme beslemesinin taşıdığı checksum, tek başına yayıncı imzasının yerine geçmez. Bu projenin yayın hedefleri yapılandırılmıştır; imzalama sertifikaları ve yayıncı hesabı ayrıca yapılandırılmalıdır. Kaynak deposu: [onurcankaraman/folio-markdown](https://github.com/onurcankaraman/folio-markdown).
