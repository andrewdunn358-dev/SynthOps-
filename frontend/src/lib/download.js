import { apiClient } from '../App';
import { toast } from 'sonner';

/**
 * Download an authenticated API export as a file.
 *
 * window.open() can't send the Authorization header (the token lives in
 * localStorage, not a cookie), so auth-required export endpoints 401 when
 * opened directly. This fetches via apiClient (token attached), then triggers
 * a browser download from a blob URL.
 *
 * Note: uses an <a download> click, NOT window.open — window.open with
 * 'noopener' breaks blob URLs in Chrome.
 *
 * @param {string} path - API path, e.g. '/export/incidents'
 * @param {string} fallbackFilename - used if no Content-Disposition filename
 */
export async function downloadExport(path, fallbackFilename) {
  try {
    const res = await apiClient.get(path, { responseType: 'blob' });
    const dispo = res.headers['content-disposition'] || '';
    const match = dispo.match(/filename="?([^";]+)"?/i);
    const filename = match ? match[1] : fallbackFilename;

    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error('Export failed — please try again');
  }
}
