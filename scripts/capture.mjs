// Reads the "Add resource" issue, screenshots the link, and updates resources.json.
import fs from 'node:fs/promises';

const body = process.env.ISSUE_BODY || '';

export function field(text, label) {
  // Issue forms arrive as "### Label\n\nvalue" blocks.
  const re = new RegExp(`###\\s*${label}[^\\n]*\\n+([\\s\\S]*?)(?=\\n###|$)`, 'i');
  const m = text.match(re);
  if (!m) return '';
  const v = m[1].trim();
  return v === '_No response_' ? '' : v;
}

export function slugify(url) {
  const raw = (url.hostname.replace(/^www\./, '') + url.pathname)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw.slice(0, 60) || 'resource';
}

export function cleanTitle(title, fallback) {
  // "Florian Kiem | Writing" becomes "Florian Kiem"
  const first = (title || '').split(/\s[|·•–—-]\s/)[0].replace(/\s+/g, ' ').trim();
  return first || fallback;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const rawUrl = field(body, 'Link');
  const tag = field(body, 'Tag').replace(/\s+/g, ' ').trim();
  const customTitle = field(body, 'Title');
  const subtagRaw = field(body, 'Sub-tag');
  const subtag = /^none$/i.test(subtagRaw) ? '' : subtagRaw;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`"${rawUrl}" is not a valid link.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) fail('The link must start with http:// or https://');

  const slug = slugify(url);
  const image = `screenshots/${slug}.jpg`;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1014 } });
  try {
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    // Some sites never go quiet. Fall back to "page loaded" and give it a moment.
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await page.waitForTimeout(2000);
  // Landscape screenshot (1440 x 1014), same shape as the card image (243 x 171)
  await page.screenshot({ path: image, type: 'jpeg', quality: 80 });
  const pageTitle = await page.title();
  await browser.close();

  const title = customTitle || cleanTitle(pageTitle, url.hostname.replace(/^www\./, ''));

  const list = JSON.parse(await fs.readFile('resources.json', 'utf8'));
  const rest = list.filter((r) => r.url !== url.href);
  rest.unshift({
    title,
    tag: tag || 'Other',
    ...(subtag ? { subtag } : {}),
    url: url.href,
    image,
    added: new Date().toISOString().slice(0, 10),
  });
  await fs.writeFile('resources.json', JSON.stringify(rest, null, 2) + '\n');

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `title=${title.replace(/[\r\n]/g, ' ')}\n`);
  }
  console.log(`Saved "${title}" (${tag}) -> ${image}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => fail(e.message));
}
