import { useSyncExternalStore } from 'react';
let language: 'tr' | 'en' = 'tr';
const listeners = new Set<() => void>();
export function setUILanguage(next: 'tr' | 'en') {
  if (next !== language) {
    language = next;
    document.documentElement.lang = next;
    listeners.forEach((f) => f());
  }
}
const pairs = `Yazı boyutunu sıfırla=Reset text size
Yazı boyutu ölçeği=Text size scale
Sayfa yakınlaştırma=Page zoom
Genişliğe sığdır=Fit to width
Sayfayı uzaklaştır=Zoom page out
Sayfayı yakınlaştır=Zoom page in
Sayfayı %100 göster=Show page at 100%
İki parmakla sıkıştırıp açarak sayfayı yakınlaştır. İki parmakla yatay ve dikey kaydır. Ctrl veya ⌘ ile tekerlek de yakınlaştırır. Alt çubukta yazı boyutu ve sayfa ölçeği ayrıdır; genişliğe sığdırabilir veya %100’e dönebilirsin.=Pinch with two fingers to zoom the page. Scroll horizontally and vertically with two fingers. Ctrl or ⌘ with the wheel also zooms. Text size and page scale are separate in the footer; fit to width or return to 100%.
düşüncelerine yer aç.=make room for your thoughts.
YEREL ÇALIŞMA ALANI=LOCAL WORKSPACE
Paneli gizle=Hide sidebar
Yeni belge=New document
Dosya aç=Open file
Belgede ara=Find in document
ÇALIŞMA ALANI=WORKSPACE
Klasör aç=Open folder
İçindekiler=Outline
Dosyalar=Files
Belge içindekiler=Document outline
Başlık eklediğinde belge yapısı burada görünecek.=Add headings to see your document outline here.
Bir klasörle çalış=Work with a folder
Klasör seç=Choose folder
SON AÇILANLAR=RECENT FILES
Sadece senin bilgisayarında.=Only on your computer.
Dosyaların her zaman sana ait.=Your files always belong to you.
Ayarlar=Settings
Yardım ve kısayollar=Help and shortcuts
Yan paneli aç=Show sidebar
Sekmeyi kapat=Close tab
Yeni sekme=New tab
Odak modu=Focus mode
Komutlar=Commands
Belgelerim=My documents
Kaydet=Save
Dışa aktar=Export
BELGENİ PAYLAŞ=SHARE YOUR DOCUMENT
PDF belgesi=PDF document
Bağımsız HTML=Standalone HTML
Belge + görseller (ZIP)=Document + assets (ZIP)
Markdown dosyası=Markdown file
Çıktı ayarları…=Export settings…
Belge görünümü=Document view
Paragraf biçimi=Paragraph style
Normal metin=Normal text
Başlık=Heading
Kalın (⌘ B)=Bold (⌘ B)
İtalik (⌘ I)=Italic (⌘ I)
Üstü çizili=Strikethrough
Satır içi kod=Inline code
Madde listesi=Bullet list
Numaralı liste=Numbered list
Görev listesi=Task list
Alıntı=Quote
Ekle=Insert
BELGENİ ZENGİNLEŞTİR=ENRICH YOUR DOCUMENT
Dosyadan görsel=Image from file
CSV / TSV tablosu=CSV / TSV table
Ayırıcı=Divider
Geri al=Undo
İleri al=Redo
Tablo araçları=Table tools
dk okuma=min read
Yeni bir düşünceye yer aç.=Make room for a new thought.
Yazmaya başla veya Ekle menüsünden bir blok seç.=Start writing or choose a block from Insert.
Tarayıcı önizlemesi=Browser preview
kelime=words
karakter=characters
Yakınlaştırmayı sıfırla=Reset zoom
Belge yakınlaştırma=Document zoom
Görünümü genişlet=Expand view
Odak modundan çık=Exit focus mode
Bildirimi kapat=Dismiss notification
Bir tablo ekle=Insert a table
CSV / TSV içe aktar=Import CSV / TSV
İptal=Cancel
Tabloyu ekle=Insert table
Hücreleri tıklayarak düzenle. Tab ile bir sonraki hücreye geç.=Click cells to edit. Press Tab to move to the next cell.
Sütun=Columns
Gövde satırı=Body rows
Başlık satırı ayrıca eklenir. Standart Markdown tabloları hücre birleştirme ve kalıcı sütun genişliğini desteklemez.=A header row is added separately. Standard Markdown tables do not support merged cells or fixed column widths.
Kendine göre bir alan=A space of your own
Tercihlerin bu bilgisayarda saklanır.=Your preferences stay on this computer.
Tamam=Done
Görünüm=Appearance
Belge yazı tipi=Document font
Sade · Sans serif=Simple · Sans serif
Kitap · Serif=Book · Serif
Yazı boyutu=Font size
Belge genişliği ·=Document width ·
Dosyalar ve güvenlik=Files and safety
Otomatik kaydet=Auto-save
Yalnız diskte konumu olan dosyalara, yazmayı bıraktıktan sonra kaydet.=Save existing files after you stop typing.
Kurtarma taslakları otomatik korunur. Belge içeriğin hiçbir sunucuya gönderilmez.=Recovery drafts are protected automatically. Your document content is never uploaded.
Taslakları yönet=Manage drafts
Sürüm geçmişi=Version history
Ayarları dışa aktar=Export settings
Belgeni yanında götür=Take your document with you
Bir paylaşım biçimi seç. Yerel görseller, formüller ve diyagramlar çıktıda korunur.=Choose a format. Local images, formulas and diagrams stay in your export.
PDF yönü: yatay=PDF orientation: landscape
Bir sürümü ayrı taslak olarak aç. Diskteki dosyanın üzerine otomatik yazılmaz.=Open a version as a separate draft. The disk file is never overwritten automatically.
Aç=Open
Taslağı sil=Delete draft
Folio ile tanış=Meet Folio
Markdown kodu yazmadan belgelerini oku, düzenle ve paylaş. Dosyaların bilgisayarında kalır.=Read, edit and share without writing Markdown. Your files stay on your computer.
Dört görünüm, tek belge=Four views, one document
Oku=Read
ile belgeyi incele.=to read your document.
Düzenle=Edit
ile metne tıkla ve yaz.=to click and write directly.
Kaynak=Source
ile gerçek Markdown'a ulaş.=to access the actual Markdown.
Bölünmüş=Split
ile ikisini birlikte gör.=to see both side by side.
İçerik ekle=Insert content
Ekle menüsünde tablolar, sembollerle oluşturulan formüller, 16 diyagram türü, dipnotlar ve bilgi kutuları var. Formül veya diyagrama çift tıklayarak yeniden düzenleyebilirsin.=Insert tables, visual formulas, 16 diagram types, footnotes and callouts. Double-click a formula or diagram to edit it again.
Folio 1.0.0 · Yerel Markdown atölyesi=Folio 1.0.0 · Local Markdown studio
Görsel olarak desteklenmeyen içerikler kaynağı korunarak açılır.=Unsupported visual content opens with its source preserved.
Ne yapmak istersin?=What would you like to do?
Değişikliklerini kaydedelim mi?=Save your changes?
Kaydetme=Don't save
dosyasında kaydedilmemiş değişiklikler var.=has unsaved changes.
Dosya başka bir yerde değişti=The file changed elsewhere
Disk sürümünü ayrı aç=Open disk version separately
Birleştir…=Merge…
Benimkini farklı kaydet=Save mine as…
Disk sürümünü yükle=Load disk version
Değişikliklerin sessizce ezilmedi. İki sürümü inceleyip korumak istediğini seç.=Your changes were protected. Review both versions and choose what to keep.
Senin değişikliklerin=Your changes
Diskteki içerik=Disk content
Uygula=Apply
Özgün kaynak korunur. Değişiklik yalnız bu bloğa uygulanır.=Original source is preserved. Changes apply only to this block.
Blok kaynağı=Block source
Hedef=Target
Yerel görsel eklemek için araç çubuğundaki “Dosyadan görsel” seçeneğini kullanabilirsin.=Use Image from file in the toolbar to add a local image.
Tür=Type
Dil=Language
İçerik=Content
Blok içeriği=Block content
Belgenin başında saklanan özellikler. Sayı, doğru/yanlış, liste ve nesne değerleri JSON biçiminde de girilebilir.=Properties stored at the beginning of your document. Numbers, booleans, arrays and objects can also be entered as JSON.
Özellik adı=Property name
Özellik=Property
Özellik değeri=Property value
Değer=Value
Özelliği sil=Delete property
Özellik ekle=Add property
Alan adı=Field name
Alan türü=Field type
Anahtar=Key
Alanı sil=Delete field
Görünürlük=Visibility
Üyeyi sil=Delete member
Metot ekle=Add method
Düşüncelerini görselleştir=Visualize your thoughts
· Mermaid olarak kaydedilir=· Saved as Mermaid
Diyagramı uygula=Apply diagram
Diyagram türleri=Diagram types
Görsel oluşturucu=Visual builder
Önizleme=Preview
Mermaid kaynağı=Mermaid source
Kaynak aynen korunur. Harici diyagramlarda görsel modele aktarılamayan ayrıntılar olabilir.=The source stays intact. External diagrams may contain details outside the visual model.
İsteğe bağlı başlık=Optional title
Yön=Direction
Öğe ekle=Add item
Öğe etiketi=Item label
Öğe türü=Item type
Grup veya üst öğe=Group or parent
Öğeyi sil=Delete item
Bağlantılar=Connections
Bağlantı ekle=Add connection
Kaynak öğe=Source item
Başlangıç/bitiş=Start/end
Hedef öğe=Target item
Bağlantı etiketi=Connection label
Etiket=Label
İlişki türü=Relationship type
Bağlantıyı sil=Delete connection
Satır ekle=Add row
Satırı yukarı taşı=Move row up
Satırı aşağı taşı=Move row down
Satırı sil=Delete row
CANLI ÖNİZLEME=LIVE PREVIEW
Bir formül oluştur=Create a formula
LaTeX bilmen gerekmiyor.=No LaTeX knowledge needed.
Formülü uygula=Apply formula
Bir yapı seç, boşlukları doldur. Alanlar arasında yön tuşları ve Tab ile ilerle.=Choose a structure and fill the placeholders. Use arrow keys and Tab to navigate.
BELGEDEKİ GÖRÜNÜM=DOCUMENT PREVIEW
Metnin içinde göster=Show inline
LaTeX kaynağı=LaTeX source
Değişiklikleri birleştir=Merge changes
· Henüz diske yazılmaz=· Nothing is written to disk yet
Birleşimi belgeye uygula=Apply merged document
Çakışmayan değişiklikler otomatik birleştirildi. Aynı alanı etkileyen değişikliklerde hangi içeriği koruyacağını seç.=Nonconflicting changes were merged automatically. Choose which content to keep in conflicting regions.
Çakışan alan=Conflicting region
Benim değişikliğim=My changes
Diskteki değişiklik=Disk changes
Ortak önceki sürüm=Common previous version
Birleşmiş belge=Merged document
Kapat=Close
Geçersiz formül=Invalid formula
MERMAID DİYAGRAMI=MERMAID DIAGRAM
Büyüt=Expand
Mermaid kopyala=Copy Mermaid
Diyagram çizilemedi=Could not render diagram
Diyagram hazırlanıyor…=Preparing diagram…
SVG indir=Download SVG
Kodu kopyala=Copy code
Görev durumu=Task status
Belgende ara=Search your document
eşleşme · Markdown kaynağı=matches · Markdown source
Değiştir=Replace
Tümünü değiştir=Replace all
Aranacak metin=Find text
Ne arıyorsun?=What are you looking for?
Önceki eşleşme=Previous match
Sonraki eşleşme=Next match
Yeni metin=Replace with
Büyük/küçük harf=Match case
Tam sözcük=Whole word
Formülü düzenle=Edit formula
Açık=Light
Koyu=Dark
Sistem=System
Tablo=Table
Matematik formülü=Math formula
Diyagram · 16 tür=Diagram · 16 types
Bağlantı=Link
Kod bloğu=Code block
Bilgi kutusu=Callout
Dipnot=Footnote
Açılır bölüm=Collapsible section
Belge özellikleri=Document properties
Tüm düşüncelerine yer var.=A place for all your thoughts.
Değişiklikler var=Unsaved changes
Kaydediliyor…=Saving…
Kaydedildi=Saved
Yerel belge=Local document
Kaydedilmemiş değişiklikler=Unsaved changes
Taslak korundu=Draft protected
Akış diyagramı=Flowchart
Sıralama=Sequence
Sınıf diyagramı=Class diagram
Varlık ilişkileri=Entity relationships
Durum diyagramı=State diagram
Zaman çizelgesi=Timeline
Zihin haritası=Mindmap
Pasta grafik=Pie chart
Kullanıcı yolculuğu=User journey
Git grafiği=Git graph
Dört bölge=Quadrant
XY grafik=XY chart
Gereksinimler=Requirements
Kesir=Fraction
Karekök=Square root
n. kök=nth root
Üs=Power
Alt indis=Subscript
Toplam=Sum
İntegral=Integral
Limit=Limit
Matris=Matrix
Parçalı=Piecewise
Türev=Derivative
Vektör=Vector
LaTeX alanını gizle=Hide LaTeX
LaTeX kaynağını göster=Show LaTeX
Farklı kaydet=Save as
Tümünü kaydet=Save all
Yardım=Help
Tablo ekle=Insert table
Formül ekle=Insert formula
Diyagram ekle=Insert diagram
Başlangıç/bitiş=Start/end
İşlem=Process
Karar=Decision
Veritabanı=Database
Veri=Data
Alt süreç=Subprocess
Not=Note
Aktör=Actor
Katılımcı=Participant
Sütun=Column
Kart=Card
Katılımcılar=Participants
Öğeler=Items
Mesajlar ve çerçeveler=Messages and frames
Veriler=Data
Yukarıdan aşağı=Top to bottom
Soldan sağa=Left to right
Aşağıdan yukarı=Bottom to top
Sağdan sola=Right to left
Önüne satır=Row before
Sonuna satır=Row after
Önüne sütun=Column before
Sonuna sütun=Column after
Sütunu sil=Delete column
Tabloyu sil=Delete table
Sola hizala=Align left
Ortala=Align center
Sağa hizala=Align right`;
export const english: Record<string, string> = Object.fromEntries(
  pairs.split('\n').map((line) => {
    const i = line.indexOf('=');
    return [line.slice(0, i), line.slice(i + 1)];
  }),
);
Object.assign(english, {
  'Klasörde ara ve değiştir': 'Search and replace in folder',
  'Satır ↑': 'Row ↑',
  'Satır ↓': 'Row ↓',
  'Sütun ←': 'Column ←',
  'Sütun →': 'Column →',
  'Editör hazırlanıyor…': 'Preparing editor…',
  'Sekmeyi sabitle': 'Pin tab',
  'Sabitlemeyi kaldır': 'Unpin tab',
  'Diğer sekmeleri kapat': 'Close other tabs',
  'Kapatılan sekmeyi geri aç': 'Reopen closed tab',
  Ad: 'Name',
  'Var olan dosyaların üzerine yazılmaz.': 'Existing files will not be overwritten.',
  'TABLO OLUŞTURUCU': 'TABLE BUILDER',
  AYARLAR: 'SETTINGS',
  'Son oturumu geri aç': 'Restore last session',
  'Kaydedilmiş dosyaları ve sekme sırasını hatırla.': 'Remember saved files and tab order.',
  'Hakkında ve güncellemeler': 'About and updates',
  'DIŞA AKTAR': 'EXPORT',
  'KÜÇÜK BİR REHBER': 'A LITTLE GUIDE',
  'KOMUT MENÜSÜ': 'COMMAND MENU',
  'ÇAKIŞMA KORUMASI': 'CONFLICT PROTECTION',
  'Folio hakkında': 'About Folio',
  'YEREL MARKDOWN ATÖLYESİ': 'LOCAL MARKDOWN STUDIO',
  Sürüm: 'Version',
  'Hesap, telemetri veya içerik yüklemesi yok. Belgelerin bilgisayarında kalır. Güncelleme denetimi yalnız aşağıdaki eylemle yapılır.':
    'No account, telemetry or content uploads. Your documents stay on your computer. Updates are checked only when requested below.',
  Güncellemeler: 'Updates',
  'Yayın kanalı (HTTPS)': 'Release channel (HTTPS)',
  indir: 'download',
  'Belgeleri kaydet ve güncelle': 'Save documents and update',
  'Yerel veriler': 'Local data',
  'Veri klasörünü göster': 'Show data folder',
  'Son dosyaları temizle': 'Clear recent files',
  'Kayıt geçmişini temizle': 'Clear version history',
  'Tanılama bilgilerini kaydet': 'Save diagnostics',
  'Temizleme işlemleri Markdown dosyalarını veya kurtarılmamış taslakları silmez. Tanılama belgesi içerik ve kişisel dosya yolları içermez.':
    'Cleanup does not delete Markdown files or unrecovered drafts. Diagnostics contain no document content or personal paths.',
  'BELGE ARAÇLARI': 'DOCUMENT TOOLS',
  'Tabloyu içe aktar': 'Import table',
  'satır ·': 'rows ·',
  sütun: 'columns',
  Ayraç: 'Delimiter',
  Virgül: 'Comma',
  'Noktalı virgül': 'Semicolon',
  Kodlama: 'Encoding',
  'İlk satır başlık içeriyor': 'First row contains headers',
  'İlk 12 satır ve 20 sütun gösteriliyor. Formüller çalıştırılmaz; hücreler metin olarak eklenir.':
    'Showing the first 12 rows and 20 columns. Formulas are not executed; cells are imported as text.',
  'DİYAGRAM ATÖLYESİ': 'DIAGRAM STUDIO',
  'ÇALIŞMA ALANI ARAÇLARI': 'WORKSPACE TOOLS',
  'dosya seçili · Kaydedilmemiş açık dosyalar korunur':
    'files selected · Unsaved open files are protected',
  'Seçili dosyalarda değiştir': 'Replace in selected files',
  'Büyük/küçük harfe duyarlı': 'Case sensitive',
  eşleşme: 'matches',
  'Kaydedilmemiş değişiklik var': 'Unsaved changes',
  'Açık klasördeki Markdown dosyaları taranır. Değişiklikten önce dosyaları ve yeni metni inceleyin. Diskte değişmiş dosyalara yazılmaz.':
    'Search Markdown files in the open folder. Review the selected files and replacement first. Externally changed files are never overwritten.',
  'MATEMATİK ATÖLYESİ': 'MATH STUDIO',
  'Boş alanları doldurun veya desteklenmeyen komutu düzeltin. Özgün formül iptal edene kadar korunur.':
    'Fill the placeholders or correct the unsupported command. The original formula remains protected until you apply changes.',
  'ÜÇ YÖNLÜ KARŞILAŞTIRMA': 'THREE-WAY COMPARISON',
  'ARA VE DEĞİŞTİR': 'FIND AND REPLACE',
  'Güncellemeleri denetle': 'Check for updates',
  'İşlem sürüyor…': 'Working…',
  Ara: 'Search',
  'Aranıyor…': 'Searching…',
  'Yeniden adlandır': 'Rename',
  'Yeni dosya': 'New file',
  'Yeni klasör': 'New folder',
  'Çöp kutusuna taşı': 'Move to trash',
  'Sistemde göster': 'Show in file manager',
  'BAŞLANGIÇ REHBERİ': 'GETTING STARTED',
  'MARKDOWN BELGESİ': 'MARKDOWN DOCUMENT',
  'Görünen metin': 'Display text',
  'Alternatif metin': 'Alternative text',
  'Özet / başlık': 'Summary / title',
  'Dipnot kimliği': 'Footnote identifier',
  'Görsel alanlar': 'Visual fields',
  Çarpım: 'Product',
  'Hizalı denklemler': 'Aligned equations',
  'Normal metin': 'Normal text',
  'Matris ve determinant': 'Matrix and determinant',
  'Matris satır sayısı': 'Matrix row count',
  'Matris sütun sayısı': 'Matrix column count',
  'Matris biçimi': 'Matrix style',
  'Determinant | |': 'Determinant | |',
  Parantezsiz: 'No brackets',
  'Matrisi ekle': 'Insert matrix',
  'Mevcut matrisin bir hücresini seçerek satır veya sütun ekleyip silebilirsiniz.':
    'Select a cell in an existing matrix to add or remove rows and columns.',
  'Önce matrisin içindeki bir hücreyi seçin.': 'Select a matrix cell first.',
  'FORMÜLÜ PAYLAŞ': 'SHARE FORMULA',
  'LaTeX kopyala': 'Copy LaTeX',
  'MathML kopyala': 'Copy MathML',
  'SVG indir': 'Download SVG',
  'PNG indir': 'Download PNG',
  'Panoya kopyalandı.': 'Copied to clipboard.',
  'Formül dışa aktarıldı.': 'Formula exported.',
  'Formül hazırlanıyor…': 'Preparing formula…',
  'PNG çözünürlüğü': 'PNG resolution',
  'Saydam PNG': 'Transparent PNG',
  'SVG açıklaması': 'SVG description',
  'Örneğin: İki satır ve üç sütunlu matris':
    'For example: A matrix with two rows and three columns',
  'Ayarları içe aktar': 'Import settings',
  'Ayar dosyası': 'Settings file',
  'Ayar önizlemesi': 'Settings preview',
  'Belge genişliği': 'Document width',
  Kapalı: 'Off',
  'Güncelleme adresi': 'Update address',
  'Ayarları uygula': 'Apply settings',
  'Ayarlar uygulandı.': 'Settings applied.',
  'Otomatik kaydet açık: uyguladıktan sonra konumu olan belgeler diske kaydedilebilir.':
    'Autosave is enabled: after applying, documents with a file location may be saved to disk.',
  'eşleşme değiştirilecek. Devam edilsin mi?': 'matches will be replaced. Continue?',
  'dosyada değişiklik yapılacak. Özgün sürümler yerel geçmişte korunacak. Devam edilsin mi?':
    'files will be changed. Original versions are kept in local history. Continue?',
  'Bu öğe ve ona bağlı bağlantılar silinecek. Devam edilsin mi?':
    'This item and its connections will be deleted. Continue?',
  'Tür değiştirmek mevcut çalışma taslağını yeni bir örnekle değiştirecek. Devam edilsin mi?':
    'Changing the type will replace the current draft with a new example. Continue?',
  'Bu harici kaynak görsel modele tam çevrilemiyor. Dönüşüm tanınmayan ayrıntıları kaldırabilir. Kaynağın kopyasını sakladığınızdan emin olun.':
    'This external source cannot be fully converted to the visual model. Converting may remove unrecognized details. Make sure you keep a copy of the source.',
  'çöp kutusuna taşınsın mı?': 'will be moved to the trash. Continue?',
  'Bu kurtarma taslağı silinsin mi?': 'Delete this recovery draft?',
  'Yerel değişiklikler yerine disk sürümü yüklensin mi? Yerel içerik kurtarma taslağında kalır.':
    'Load the disk version instead of your local changes? Your local content stays in a recovery draft.',
});
export const translate = (text: string) => (language === 'en' ? english[text] || text : text);
export function useT() {
  useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => language,
  );
  return translate;
}
