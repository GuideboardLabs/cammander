import { useState, useEffect, useMemo, useCallback } from 'react';
import type { SpreadsheetData } from '@/types';
import './SpreadsheetViewer.css';

interface SpreadsheetViewerProps {
  filePath: string;
  content: string;
  /** For binary files, pass base64-encoded ArrayBuffer data */
  binaryData?: string | null;
  onDataLoaded: (data: SpreadsheetData) => void;
}

function parseContent(content: string, binaryData: string | null): SpreadsheetData | null {
  // Use a dynamic try/catch since xlsx is loaded async
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XLSX = (window as any).__XLSX__;
    if (!XLSX) return null;

    let workbook: any;

    if (binaryData) {
      // Binary files (xls/xlsx) come as base64
      const binary = atob(binaryData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      workbook = XLSX.read(bytes, { type: 'array' });
    } else {
      // CSV/TSV — parse as text
      workbook = XLSX.read(content, { type: 'string' });
    }

    const sheetNames: string[] = workbook.SheetNames;
    const sheets: Record<string, string[][]> = {};

    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      // Convert to 2D array, preserve empty cells
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      // Convert everything to strings
      sheets[name] = data.map((row: any[]) => row.map((cell: any) => String(cell ?? '')));
    }

    return {
      sheetNames,
      activeSheet: sheetNames[0] || 'Sheet1',
      sheets,
    };
  } catch (err) {
    console.error('Failed to parse spreadsheet:', err);
    return null;
  }
}

export function SpreadsheetViewer({ filePath, content, binaryData, onDataLoaded }: SpreadsheetViewerProps) {
  const [xlsxLoaded, setXlsxLoaded] = useState(!!(window as any).__XLSX__);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [activeSheet, setActiveSheet] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Lazy-load SheetJS
  useEffect(() => {
    if ((window as any).__XLSX__) {
      setXlsxLoaded(true);
      return;
    }

    import('xlsx').then((XLSX) => {
      (window as any).__XLSX__ = XLSX;
      setXlsxLoaded(true);
    }).catch(() => {
      setError('Failed to load spreadsheet engine');
    });
  }, []);

  // Parse content once xlsx is loaded
  useEffect(() => {
    if (!xlsxLoaded) return;

    const result = parseContent(content, binaryData ?? null);
    if (result) {
      setData(result);
      setActiveSheet(result.activeSheet);
      onDataLoaded(result);
      setError(null);
    } else {
      setError('Could not parse this file as a spreadsheet');
    }
  }, [xlsxLoaded, content, binaryData, filePath]);

  const currentSheetData = useMemo(() => {
    if (!data || !activeSheet) return [];
    return data.sheets[activeSheet] || [];
  }, [data, activeSheet]);

  // Detect header row (first row with non-empty cells)
  const firstRow = currentSheetData.length > 0 ? currentSheetData[0]! : [];
  const hasHeader = firstRow.some((c: string) => c.trim() !== '');

  const handleSheetChange = useCallback((name: string) => {
    setActiveSheet(name);
  }, []);

  if (error) {
    return (
      <div className="spreadsheet-viewer spreadsheet-viewer--error">
        <div className="spreadsheet-error">{error}</div>
      </div>
    );
  }

  if (!xlsxLoaded || !data) {
    return (
      <div className="spreadsheet-viewer spreadsheet-viewer--loading">
        <div className="spreadsheet-loading">Loading spreadsheet engine…</div>
      </div>
    );
  }

  const maxRows = 2000;

  return (
    <div className="spreadsheet-viewer" id="spreadsheet-pane">
      {/* Sheet tabs */}
      {data.sheetNames.length > 1 && (
        <div className="spreadsheet-tabs" role="tablist" aria-label="Sheets">
          {data.sheetNames.map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={name === activeSheet}
              className={`spreadsheet-tab${name === activeSheet ? ' spreadsheet-tab--active' : ''}`}
              onClick={() => handleSheetChange(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="spreadsheet-table-wrapper">
        <table className="spreadsheet-table">
          <thead>
            <tr>
              <th className="spreadsheet-row-header">#</th>
              {firstRow.length > 0 && firstRow.map((_: string, ci: number) => (
                <th key={ci} className="spreadsheet-col-header">
                  {hasHeader ? firstRow[ci]! : String.fromCharCode(65 + (ci % 26))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(hasHeader ? currentSheetData.slice(1) : currentSheetData)
              .slice(0, maxRows)
              .map((row: string[], ri: number) => (
                <tr key={ri} className={ri % 2 === 1 ? 'spreadsheet-row--alt' : ''}>
                  <td className="spreadsheet-row-header">{(hasHeader ? ri + 2 : ri + 1)}</td>
                  {row.map((cell: string, ci: number) => (
                    <td key={ci} className="spreadsheet-cell">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {currentSheetData.length > maxRows && (
          <div className="spreadsheet-truncated">
            Showing {maxRows} of {(hasHeader ? currentSheetData.length - 1 : currentSheetData.length)} rows
          </div>
        )}
      </div>
    </div>
  );
}
