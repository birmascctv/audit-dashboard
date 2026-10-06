export const INITIAL_PRODUCTS = [];

export function formatDateTime(isoString) {
  try {
    const dateObj = new Date(isoString);
    const date = dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const time = dateObj.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const now = Date.now();
    const diffSeconds = Math.floor((now - dateObj.getTime()) / 1000);
    let relative = 'Just now';
    if (diffSeconds > 60 && diffSeconds < 3600) {
      relative = `${Math.floor(diffSeconds / 60)}m ago`;
    } else if (diffSeconds >= 3600 && diffSeconds < 86400) {
      relative = `${Math.floor(diffSeconds / 3600)}h ago`;
    } else if (diffSeconds >= 86400) {
      relative = `${Math.floor(diffSeconds / 86400)}d ago`;
    }

    return { date, time, full: `${date} ${time}`, relative };
  } catch {
    return { date: '', time: '', full: isoString, relative: '' };
  }
}

export function exportToCSV(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
