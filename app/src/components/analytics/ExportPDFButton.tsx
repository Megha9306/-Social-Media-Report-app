'use client';

import { FileDown } from 'lucide-react';

export function ExportPDFButton() {
  function handleExport() {
    window.print();
  }

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors print:hidden"
    >
      <FileDown size={14} />
      Export PDF
    </button>
  );
}
