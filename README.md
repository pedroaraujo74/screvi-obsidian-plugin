# Screvi Sync

This official plugin maintained by the Screvi team enables you to easily and automatically export all your highlights from [Screvi](https://screvi.com/) to Obsidian.

## Features

- **Automatic Sync**: Automatically sync your highlights at regular intervals
- **Manual Sync**: Sync on-demand with a single click
- **Organized by Source**: Highlights are automatically organized by source type (books, articles, tweets, etc.)


## Installation

Once approved on the [Obsidian community plugin store](https://obsidian.md/plugins):

1. Open Obsidian Settings
2. Go to Community Plugins
3. Click "Browse" and search for "Screvi Sync"
4. Click Install, then Enable

### Manual installation

Until the plugin lands in the community store, install it directly from a GitHub release:

1. Download both files from the [latest release](https://github.com/pedroaraujo74/screvi-obsidian-plugin/releases/latest):
   - `main.js`
   - `manifest.json`
2. In your vault, create the folder `.obsidian/plugins/screvi/` (the folder name must be exactly `screvi`).
3. Move the two downloaded files into that folder.
4. In Obsidian, open **Settings → Community plugins**. Make sure **Restricted mode** is off, then click the reload icon next to **Installed plugins**.
5. Enable **Screvi Sync** in the list.

To update later, repeat steps 1–3 with the new release files and reload Obsidian.

## Setup

1. Get your Screvi API key from [screvi.com/settings/api](https://app.screvi.com/settings/api)
2. Open Plugin Settings
3. Enter your API key
4. Configure sync preferences (optional)
5. Click "Sync Now" to get started

## Requirements

- A Screvi account with an active trial or subscription

## Network use and privacy

This plugin connects to a single host — `https://api.screvi.com` — to read your highlights. It uses your API key from the settings tab for authentication and sends no other data.

When **Auto sync** is enabled (default: on, every 2 hours), the plugin polls `api.screvi.com` on a timer in the background to fetch new highlights. You can change the interval, or disable auto-sync entirely and trigger syncs manually, in **Settings → Screvi Sync**.

No analytics, telemetry, or third-party services are contacted.

