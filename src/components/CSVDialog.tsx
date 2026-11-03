import { useT } from '../ui';
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { parseCSV, tableMarkdown } from '../core/csv';
export function CSVDialog({
  file,
  onApply,
  onClose,
}: {
  file: File;
  onApply: (value: string) => void;
  onClose: () => void;
}) {
  const ui = useT();

  const [bytes, setBytes] = useState<ArrayBuffer>(),
    [encoding, setEncoding] = useState('utf-8'),
    [separator, setSeparator] = useState(/\.tsv$/i.test(file.name) ? '\t' : ','),
    [header, setHeader] = useState(true);
  useEffect(() => {
    void file.arrayBuffer().then(setBytes);
  }, [file]);
  let rows: string[][] = [],
    error = '';
  try {
    if (bytes) rows = parseCSV(new TextDecoder(encoding, { fatal: true }).decode(bytes), separator);
    if (rows.length * Math.max(0, ...rows.map((r) => r.length)) > 5000)
      error = 'Tablo 5.000 hücre sınırını aşıyor.';
  } catch (e: any) {
    error = e.message;
  }
  return (
    <Modal
      title={ui('Tabloyu içe aktar')}
      eyebrow={file.name}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="footer-hint">
            {rows.length}
            {ui('satır ·')}
            {Math.max(0, ...rows.map((r) => r.length))}
            {ui('sütun')}
          </span>
          <button className="button" onClick={onClose}>
            {ui('İptal')}
          </button>
          <button
            className="button primary"
            disabled={!rows.length || !!error}
            onClick={() => {
              const all = header
                ? rows
                : [
                    Array.from(
                      { length: Math.max(...rows.map((r) => r.length)) },
                      (_, i) => 'Sütun ' + (i + 1),
                    ),
                    ...rows,
                  ];
              onApply(tableMarkdown(all));
            }}
          >
            {ui('Tabloyu ekle')}
          </button>
        </>
      }
    >
      <div className="option-grid">
        <label>
          {ui('Ayraç')}
          <select value={separator} onChange={(e) => setSeparator(e.target.value)}>
            <option value=",">{ui('Virgül')}</option>
            <option value=";">{ui('Noktalı virgül')}</option>
            <option value={'\t'}>{ui('Tab')}</option>
          </select>
        </label>
        <label>
          {ui('Kodlama')}
          <select value={encoding} onChange={(e) => setEncoding(e.target.value)}>
            {['utf-8', 'windows-1254', 'windows-1252', 'utf-16le', 'utf-16be'].map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="setting-toggle">
        <span>{ui('İlk satır başlık içeriyor')}</span>
        <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
      </label>
      {error && <p className="error-message">{error}</p>}
      <div className="markdown-body table-scroll">
        <table>
          <tbody>
            {rows.slice(0, 12).map((row, i) => (
              <tr key={i}>
                {row
                  .slice(0, 20)
                  .map((value, j) =>
                    i === 0 && header ? <th key={j}>{value}</th> : <td key={j}>{value}</td>,
                  )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        {ui(
          'İlk 12 satır ve 20 sütun gösteriliyor. Formüller çalıştırılmaz; hücreler metin olarak eklenir.',
        )}
      </p>
    </Modal>
  );
}
