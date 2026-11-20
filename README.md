# Resources

A library of websites and products I keep for design reference.

Each resource is added through an issue form. A GitHub Action opens the link, takes a screenshot, saves the title and tag, and adds it to `resources.json`. That file feeds the public page on GitHub Pages and a Figma plugin that syncs my Resource Card components, so the website and Figma always show the same set.

## Add a resource

Issues → New issue → **Add resource** → paste the link, pick a tag, submit.

The robot takes the screenshot, saves it, closes the issue, and the website updates in about a minute. Then run **Sync** in the Figma plugin.

## How it works

```
Issue form ──▶ GitHub Action (Playwright screenshot) ──▶ resources.json + screenshots/
                                                            │
                                     ┌──────────────────────┴──────────────────────┐
                                     ▼                                             ▼
                          GitHub Pages website                         Figma plugin (Sync)
```

## What's in here

| File | What it does |
|---|---|
| `resources.json` | The list of resources. The single source of truth. |
| `screenshots/` | Screenshots taken by the Action. |
| `index.html` | The public website. |
| `scripts/capture.mjs` | Opens the link and takes the screenshot. |
| `.github/ISSUE_TEMPLATE/add-resource.yml` | The "Add resource" form. |
| `.github/workflows/add-resource.yml` | The Action that runs when the form is submitted. |
| `.github/workflows/pages.yml` | Publishes the website. |
| `figma-plugin/` | The Figma plugin that syncs Resource Cards. |

## Figma plugin

Figma desktop → Plugins → Development → Import plugin from manifest → choose `figma-plugin/manifest.json`.

Select a Resource Card on the canvas, run the plugin, enter the site address once, and press **Sync**. Cards appear in a frame called "Resources (synced)". Running Sync again updates existing cards and adds new ones.
