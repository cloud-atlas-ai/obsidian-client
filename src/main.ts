import {
	App,
	Editor,
	MarkdownView,
	// Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	apiKey: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	apiKey: "",
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		try {
			this.app.vault.createFolder("CloudAtlas");
			this.app.vault.createFolder("CloudAtlas/example");
			this.app.vault.create(
				"CloudAtlas/example/system.md",
				"You are a helpful assistant."
			);
			this.app.vault.create(
				"CloudAtlas/example/user.md",
				"What is Cloud Atlas?"
			);

			new Notice("Created CloudAtlas folder");
		} catch (e) {
			console.log("Could not create folder, it likely already exists");
		}

		// This creates an icon in the left ribbon.
		// const ribbonIconEl = this.addRibbonIcon(
		// 	"dice",
		// 	"Sample Plugin",
		// 	(evt: MouseEvent) => {
		// 		// Called when the user clicks the icon.
		// 		new Notice("This is a notice!");
		// 	}
		// );
		// Perform additional things with the ribbon
		// ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText("Status Bar Text");

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "run-flow",
			name: "Run Flow",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const noteFile = this.app.workspace.getActiveFile();
				if (!noteFile) {
					return;
				}
				const user = await this.app.vault.read(noteFile);
				const systemPath =
					noteFile.path.split("/").slice(0, -1).join("/") +
					"/system.md";
				const systemFile =
					this.app.vault.getAbstractFileByPath(systemPath);
				const system = systemFile ? await this.app.vault.read(systemFile as TFile) : "You are a helpful assistant.";
				const data = { user, system };
				// console.log({ user, system });
				new Notice("Working on it...");
				const response = await fetch("https://api.cloud-atlas.ai/run", {
					headers: {
						"x-api-key": this.settings.apiKey,
					},
					method: "POST",
					body: JSON.stringify(data),
				});
				const respJson = await response.json();
				console.log(respJson);
				editor.replaceSelection(respJson);
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: "open-sample-modal-complex",
		// 	name: "Open sample modal (complex)",
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView =
		// 			this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	},
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, "click", (evt: MouseEvent) => {
		// 	console.log("click", evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(
		// 	window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		// );
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// class SampleModal extends Modal {
// 	constructor(app: App) {
// 		super(app);
// 	}

// 	onOpen() {
// 		const { contentEl } = this;
// 		contentEl.setText("Woah!");
// 	}

// 	onClose() {
// 		const { contentEl } = this;
// 		contentEl.empty();
// 	}
// }

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter API key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
