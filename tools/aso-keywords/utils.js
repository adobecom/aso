import { authFetch } from '../utils.js';

export async function fetchHTML(url, token, errorContext = 'HTML') {
  return authFetch(url, token, errorContext, 'html');
}

export function parseHTML(htmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(htmlString, 'text/html');
}
