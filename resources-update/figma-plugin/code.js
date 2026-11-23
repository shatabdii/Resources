// Resources Sync
// Reads resources.json from your GitHub Pages site and creates or updates
// Resource Card instances inside a frame called "Resources (synced)".

const CONTAINER_NAME = 'Resources (synced)';
const COMPONENT_NAME = 'Resource Card';

figma.showUI(__html__, { width: 340, height: 280 });

(async () => {
  const saved = await figma.clientStorage.getAsync('siteUrl');
  figma.ui.postMessage({ type: 'init', siteUrl: saved || '' });
})();

function status(text) {
  figma.ui.postMessage({ type: 'status', text });
}

function normalise(url) {
  if (!url) throw new Error('Add your site address first, like https://yourname.github.io/resources/');
  if (!/^https:\/\//.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  return url.endsWith('/') ? url : url + '/';
}

async function findComponent() {
  // 1. A selected Resource Card instance tells us which component to use.
  const sel = figma.currentPage.selection[0];
  if (sel && sel.type === 'INSTANCE') {
    const main = await sel.getMainComponentAsync();
    if (main) return main;
  }
  if (sel && sel.type === 'COMPONENT') return sel;

  // 2. Otherwise look for a component called "Resource Card" anywhere in the file.
  await figma.loadAllPagesAsync();
  const node = figma.root.findOne(
    (n) => (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') && n.name === COMPONENT_NAME
  );
  if (!node) {
    throw new Error('Could not find the Resource Card. Select one on the canvas and press Sync again.');
  }
  return node.type === 'COMPONENT_SET' ? node.defaultVariant : node;
}

function getContainer(cardWidth) {
  let frame = figma.currentPage.findOne((n) => n.type === 'FRAME' && n.name === CONTAINER_NAME);
  if (frame) return frame;

  frame = figma.createFrame();
  frame.name = CONTAINER_NAME;
  frame.layoutMode = 'HORIZONTAL';
  frame.layoutWrap = 'WRAP';
  frame.itemSpacing = 24;
  frame.counterAxisSpacing = 24;
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 40;
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'AUTO';
  frame.resize(cardWidth * 3 + 24 * 2 + 80, 400);
  frame.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.957 } }];
  frame.cornerRadius = 24;

  // Place it to the right of everything else on the page.
  const others = figma.currentPage.children.filter((n) => n !== frame);
  const right = others.reduce((max, n) => Math.max(max, n.x + n.width), 0);
  const top = others.reduce((min, n) => Math.min(min, n.y), Infinity);
  frame.x = right + 200;
  frame.y = top === Infinity ? 0 : top;
  return frame;
}

async function loadFonts(text) {
  if (text.characters.length === 0) {
    if (text.fontName !== figma.mixed) await figma.loadFontAsync(text.fontName);
    return;
  }
  const fonts = text.getRangeAllFontNames(0, text.characters.length);
  await Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
}

function findText(card, name) {
  const node = card.findOne((n) => n.name === name);
  if (!node) return null;
  if (node.type === 'TEXT') return node;
  // e.g. the "tag" is an instance with a text layer inside it
  return 'findOne' in node ? node.findOne((n) => n.type === 'TEXT') : null;
}

async function fillCard(card, item, base) {
  // The card has one tag slot: use the first tag (older cards have "tag")
  const mainTag = Array.isArray(item.tags) && item.tags.length ? item.tags[0] : item.tag;
  // Screenshot
  const imageLayer = card.findOne((n) => n.name === 'Image' && 'fills' in n);
  if (imageLayer && item.image) {
    const image = await figma.createImageAsync(base + item.image);
    imageLayer.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
  }

  // Title
  const title = findText(card, 'Resource Title');
  if (title) {
    await loadFonts(title);
    title.characters = item.title;
  }

  // Tag: switch to the matching variant ("Designer", "Design Talks", ...)
  const tagNode = card.findOne((n) => n.name === 'tag');
  if (tagNode && tagNode.type === 'INSTANCE') {
    await setTagVariant(tagNode, mainTag);
  } else {
    const tag = findText(card, 'tag');
    if (tag) {
      await loadFonts(tag);
      tag.characters = mainTag;
    }
  }

  // Link
  const link = card.findOne((n) => n.type === 'TEXT' && /link/i.test(n.name));
  if (link) {
    await loadFonts(link);
    link.hyperlink = { type: 'URL', value: item.url };
  }

  card.name = item.title;
  card.setPluginData('url', item.url);
}

function plain(text) {
  return String(text || '').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();
}

async function setTagVariant(tagInstance, tagName) {
  let wanted = plain(tagName);
  if (wanted === 'designer') wanted = 'portfolios'; // old tag name
  const main = await tagInstance.getMainComponentAsync();
  const set = main && main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
  if (set) {
    // Match by the variant's text ("💡 Design Talks") or its variant name ("Designer")
    const match = set.children.find((v) => {
      const t = v.findOne((n) => n.type === 'TEXT');
      const values = Object.values(v.variantProperties || {}).map(plain);
      return (t && plain(t.characters) === wanted) || values.includes(wanted);
    });
    if (match) {
      tagInstance.swapComponent(match);
      return;
    }
  }
  // No matching variant: just change the text
  const t = tagInstance.findOne((n) => n.type === 'TEXT');
  if (t) {
    await loadFonts(t);
    t.characters = tagName;
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'sync') return;
  try {
    const base = normalise(msg.siteUrl);
    await figma.clientStorage.setAsync('siteUrl', base);

    status('Loading resources…');
    const res = await fetch(base + 'resources.json?t=' + Date.now());
    if (!res.ok) throw new Error(`Could not load resources.json (error ${res.status}). Check the site address.`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      figma.ui.postMessage({ type: 'done', text: 'No resources yet. Add one on GitHub first.' });
      return;
    }

    const component = await findComponent();
    const container = getContainer(component.width);

    let added = 0;
    let updated = 0;
    const failed = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      status(`Syncing ${i + 1} of ${items.length}: ${item.title}`);
      try {
        let card = container.children.find((c) => c.getPluginData('url') === item.url);
        if (card) {
          updated++;
        } else {
          card = component.createInstance();
          container.appendChild(card);
          added++;
        }
        container.insertChild(i, card); // keep the same order as the website (newest first)
        await fillCard(card, item, base);
      } catch (e) {
        failed.push(`${item.title}: ${e.message}`);
      }
    }

    figma.currentPage.selection = [container];
    figma.viewport.scrollAndZoomIntoView([container]);

    let text = `Done. ${added} added, ${updated} updated.`;
    if (failed.length) text += `\n\nCould not sync:\n${failed.join('\n')}`;
    figma.ui.postMessage({ type: failed.length ? 'error' : 'done', text });
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: e.message });
  }
};
