import { authFetch } from '../utils.js';

export async function fetchHTML(url, token, errorContext = 'HTML', cacheBust = false) {
  return authFetch(url, token, errorContext, 'html', cacheBust);
}

export function parseHTML(htmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(htmlString, 'text/html');
}
