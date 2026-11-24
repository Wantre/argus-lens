// Moteurs ouverts dans un onglet : uniquement construction d'URL, aucun scraping.
import { translate } from '../core/operators-compat.js';

const enc = encodeURIComponent;
const t = (id, ast) => translate(id, ast);

export const TAB_ENGINES = [
  { id: 'google', name: 'Google', short: 'GO', color: '#4285F4', group: 'web',
    url: (ast) => { const { query, params } = t('google', ast); let u = `https://www.google.com/search?q=${enc(query)}`; if (params.lang) u += `&lr=lang_${enc(params.lang)}`; if (params.region) u += `&cr=country${enc(params.region.toUpperCase())}`; return u; } },
  { id: 'bing', name: 'Bing', short: 'BI', color: '#0F7C8C', group: 'web', url: (ast) => `https://www.bing.com/search?q=${enc(t('bing', ast).query)}` },
  { id: 'ddg', name: 'DuckDuckGo', short: 'DD', color: '#DE5833', group: 'web',
    url: (ast) => { const { query, params } = t('ddg', ast); let u = `https://duckduckgo.com/?q=${enc(query)}`; if (params.region || params.lang) u += `&kl=${enc(`${params.region || params.lang}-${params.lang || params.region}`)}`; return u; } },
  { id: 'yandex', name: 'Yandex', short: 'YA', color: '#E03A1E', group: 'web', url: (ast) => `https://yandex.com/search/?text=${enc(t('yandex', ast).query)}` },
  { id: 'startpage', name: 'Startpage', short: 'SP', color: '#5468FF', group: 'web', url: (ast) => `https://www.startpage.com/do/search?query=${enc(t('startpage', ast).query)}` },
  { id: 'qwant', name: 'Qwant', short: 'QW', color: '#5C97FF', group: 'web', url: (ast) => `https://www.qwant.com/?q=${enc(t('qwant', ast).query)}` },
  { id: 'ecosia', name: 'Ecosia', short: 'EC', color: '#2F9E5B', group: 'web', url: (ast) => `https://www.ecosia.org/search?q=${enc(t('ecosia', ast).query)}` },
  { id: 'brave-web', name: 'Brave Search', short: 'BR', color: '#FB542B', group: 'web', compat: 'brave', url: (ast) => `https://search.brave.com/search?q=${enc(t('brave', ast).query)}` },
  { id: 'mojeek-web', name: 'Mojeek', short: 'MJ', color: '#2E7BCF', group: 'web', compat: 'mojeek', url: (ast) => `https://www.mojeek.com/search?q=${enc(t('mojeek', ast).query)}` },
  { id: 'marginalia-web', name: 'Marginalia', short: 'MG', color: '#7C5CFF', group: 'web', compat: 'marginalia', url: (ast) => `https://marginalia-search.com/search?query=${enc(t('marginalia', ast).query)}` },
  { id: 'yahoo', name: 'Yahoo', short: 'YH', color: '#6001D2', group: 'web', url: (ast) => `https://search.yahoo.com/search?p=${enc(t('yahoo', ast).query)}` },
  { id: 'baidu', name: 'Baidu', short: 'BD', color: '#2932E1', group: 'web', url: (ast) => `https://www.baidu.com/s?wd=${enc(t('baidu', ast).query)}` },
  { id: 'naver', name: 'Naver', short: 'NV', color: '#03A94D', group: 'web', url: (ast) => `https://search.naver.com/search.naver?query=${enc(t('naver', ast).query)}` },
  { id: 'scholar', name: 'Google Scholar', short: 'GS', color: '#4A6FD8', group: 'savoir', compat: 'google', url: (ast) => `https://scholar.google.com/scholar?q=${enc(t('google', ast).query)}` },
  { id: 'base', name: 'BASE', short: 'BA', color: '#1D5C96', group: 'savoir', url: (ast) => `https://www.base-search.net/Search/Results?lookfor=${enc(t('generic', ast).query)}` },
  { id: 'ia-fulltext', name: 'Internet Archive', short: 'IA', color: '#A8742F', group: 'archives', url: (ast) => `https://archive.org/search?query=${enc(t('generic', ast).query)}&sin=TXT` },
  { id: 'wayback-web', name: 'Wayback (calendrier)', short: 'WB', color: '#A8742F', group: 'archives', needsUrl: true, url: (ast, target) => `https://web.archive.org/web/*/${target || ''}*` },
  { id: 'archive-today', name: 'archive.today', short: 'AT', color: '#8A6D3B', group: 'archives', needsUrl: true, url: (ast, target) => `https://archive.ph/${target || ''}` },
  { id: 'ahmia', name: 'Ahmia (index .onion, consultation)', short: 'AH', color: '#7B3FA0', group: 'archives', url: (ast) => `https://ahmia.fi/search/?q=${enc(t('generic', ast).query)}` },
  { id: 'x', name: 'X (recherche)', short: 'X', color: '#3A3A3A', group: 'social', url: (ast) => `https://x.com/search?q=${enc(t('generic', ast).query)}&f=live` },
  { id: 'reddit', name: 'Reddit', short: 'RD', color: '#FF4500', group: 'social', url: (ast) => `https://www.reddit.com/search/?q=${enc(t('generic', ast).query)}` },
  { id: 'hn', name: 'Hacker News', short: 'HN', color: '#FF6600', group: 'social', url: (ast) => `https://hn.algolia.com/?q=${enc(t('generic', ast).query)}` },
  { id: 'stackoverflow', name: 'Stack Overflow', short: 'SO', color: '#F48024', group: 'code', url: (ast) => `https://stackoverflow.com/search?q=${enc(t('generic', ast).query)}` },
  { id: 'codeberg', name: 'Codeberg', short: 'CB', color: '#2185D0', group: 'code', url: (ast) => `https://codeberg.org/explore/repos?q=${enc(t('generic', ast).query)}` },
  { id: 'gitlab', name: 'GitLab', short: 'GL', color: '#E24329', group: 'code', url: (ast) => `https://gitlab.com/search?search=${enc(t('generic', ast).query)}` },
  { id: 'shodan', name: 'Shodan (consultation)', short: 'SH', color: '#B80000', group: 'infra', needsDomain: true, url: (ast, target) => `https://www.shodan.io/domain/${enc(target || '')}` },
  { id: 'censys', name: 'Censys (consultation)', short: 'CE', color: '#F27C21', group: 'infra', url: (ast, target) => `https://search.censys.io/search?resource=hosts&q=${enc(target || t('generic', ast).query)}` },
  { id: 'virustotal', name: 'VirusTotal (rapports)', short: 'VT', color: '#394EFF', group: 'infra', needsDomain: true, url: (ast, target) => `https://www.virustotal.com/gui/domain/${enc(target || '')}` },
  { id: 'attack', name: 'MITRE ATT&CK', short: 'AK', color: '#C8102E', group: 'cti', url: (ast) => `https://attack.mitre.org/search/?q=${enc(t('generic', ast).query)}` },
  { id: 'kev', name: 'CISA KEV', short: 'KV', color: '#005288', group: 'cti', url: (ast) => `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${enc(t('generic', ast).query)}` },
];

export const BURST_DEFAULT = ['google', 'bing', 'ddg', 'yandex', 'startpage'];

export function tabEngine(id) {
  return TAB_ENGINES.find((e) => e.id === id);
}

export function buildTabUrl(id, ast, target) {
  const e = tabEngine(id);
  return e ? e.url(ast, target) : null;
}

export function ignoredFor(id, ast) {
  const e = tabEngine(id);
  if (!e || e.needsUrl || e.needsDomain) return [];
  return translate(e.compat || id, ast).ignored;
}

// Recherche inversée d'image (ouverture en onglet).
export const REVERSE_IMAGE = [
  { id: 'lens', name: 'Google Lens', url: (u) => `https://lens.google.com/uploadbyurl?url=${enc(u)}` },
  { id: 'bingv', name: 'Bing Visual Search', url: (u) => `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${enc(u)}` },
  { id: 'yandexi', name: 'Yandex Images', url: (u) => `https://yandex.com/images/search?rpt=imageview&url=${enc(u)}` },
  { id: 'tineye', name: 'TinEye', url: (u) => `https://tineye.com/search?url=${enc(u)}` },
];
