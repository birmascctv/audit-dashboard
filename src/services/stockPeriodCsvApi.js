const API_BASE = '/api/stock-period-csv';

async function readResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    throw new Error(
      `Stock CSV endpoint returned HTTP ${response.status} instead of JSON. `
      + 'Check that the updated Audit server is deployed and restarted.'
    );
  }
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `${fallbackMessage} (HTTP ${response.status})`);
  }
  return data;
}

export async function previewStockPeriodCsv(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE}/preview`, {
    method: 'POST',
    body: formData,
  });
  return readResponse(response, 'Could not validate the CSV file.');
}

export async function uploadStockPeriodCsv(file, uploadedBy) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadedBy', uploadedBy);
  const response = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    body: formData,
  });
  return readResponse(response, 'CSV upload failed.');
}

export async function fetchStockPeriodCsvHistory() {
  const response = await fetch(`${API_BASE}/uploads`);
  return readResponse(response, 'Could not load CSV upload history.');
}

export async function fetchLatestStockPeriodCsv() {
  const response = await fetch(`${API_BASE}/uploads/latest`);
  return readResponse(response, 'Could not load the latest CSV data.');
}

export async function fetchStockPeriodCsv(uploadId) {
  const response = await fetch(`${API_BASE}/uploads/${encodeURIComponent(uploadId)}`);
  return readResponse(response, 'Could not load the selected CSV data.');
}

export async function downloadStockPeriodCsv(upload) {
  const response = await fetch(`${API_BASE}/uploads/${encodeURIComponent(upload.id)}/download`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not download the stored CSV.');
  }

  const blob = await response.blob();
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = upload.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function deleteStockPeriodCsv(uploadId) {
  const response = await fetch(`${API_BASE}/uploads/${encodeURIComponent(uploadId)}`, {
    method: 'DELETE',
  });
  return readResponse(response, 'Could not delete the CSV upload.');
}
