# Obsidian Cloud Atlas Plugin

This is a plugin for [Obsidian](https://obsidian.md) to execute Flows (definition TBD).

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Development

1. To develop Obsidian plugins you need NodeJS and npm installed. Do that first.
2. `npm install`
3. Make the changes you want...
4. `npm run dev` will watch for changes and build the plugin to `dist/main.js`.
5. copy `dist.main/js` to your Obdisian vault plugin folder (`cp dist/main.js <vault>/.obsidian/plugins/cloud-atlas/`).
6. Reload the vault or use the [Hot Reload Plugin](https://github.com/pjeby/hot-reload).

Resources:

- Obsidian [API Documentation](https://github.com/obsidianmd/obsidian-api)
