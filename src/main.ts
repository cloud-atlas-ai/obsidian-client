	import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
} from "obsidian";
import { stringify } from "querystring";

interface CloudAtlasPluginSettings {
	apiKey: string;
}

const DEFAULT_SETTINGS: CloudAtlasPluginSettings = {
	apiKey: "",
};

let noticeTimeout: NodeJS.Timeout;

const animateNotice = (notice: Notice) => {
	let message = notice.noticeEl.innerText;
	const dots = message.split(" ")[message.split(" ").length - 1];
	if (dots.length == 1) {
		message = message.replace(" .", " ..");
	} else if (dots.length == 2) {
		message = message.replace(" ..", " ...");
	} else if (dots.length == 3) {
		message = message.replace(" ...", " .");
	}
	notice.setMessage(message);
	noticeTimeout = setTimeout(() => animateNotice(notice), 500);
};

export default class CloudAtlasPlugin extends Plugin {
	settings: CloudAtlasPluginSettings;

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
				"What is Cloud Atlas? [[additional context]]\n"
			);
			this.app.vault.create(
				"CloudAtlas/example/additional context.md",
				"I mean the novel."
			);

			new Notice("Created CloudAtlas folder with an example flow. Please configure the plugin to use it.");
		} catch (e) {
			console.log("Could not create folder, it likely already exists");
		}

		const cloudAtlasFolder = this.app.vault.getAbstractFileByPath("CloudAtlas");
		if (cloudAtlasFolder instanceof TFolder) {
			cloudAtlasFolder.children.forEach((subfolder: TFolder) => {
				return this.addNewCommand(this, subfolder.name);
			});
		}

		this.addSettingTab(new CloudAtlasGlobalSettingsTab(this.app, this));
		}

	private addNewCommand(plugin: CloudAtlasPlugin, flow: string): void {
		this.addCommand({
			id: `run-flow-${flow}`,
			name: `Run ${flow} Flow`,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const noteFile = this.app.workspace.getActiveFile();
				if (!noteFile) {
					return;
				}
				// Read the content of the current note file.
				let noteContent = await this.app.vault.read(noteFile);
				const currentFolderPath = noteFile.path.split("/").slice(0, -1).join("/");

				const userPromptPath = `CloudAtlas/${flow}/user_prompt.md`;
				const systemPath = `CloudAtlas/${flow}/system.md`;

				const userPromptFile = this.app.vault.getAbstractFileByPath(userPromptPath);
				const userPrompt = userPromptFile
					? await this.app.vault.read(userPromptFile as TFile)
					: "";

				// Initialize the user object with the current page content.
				let user: {
					user_prompt: string;
					input: string;
					additional_context: { [key: string]: string };
				} = {
					user_prompt: userPrompt,
					input: noteContent,
					additional_context: {}
				};

				// Get resolved links from the current note file.
				const activeResolvedLinks = this.app.metadataCache.resolvedLinks[noteFile.path];

				// Process each resolved link.
				for (const property in activeResolvedLinks) {
					try {
						const linkedNoteContent = await this.app.vault.read(
							this.app.vault.getAbstractFileByPath(property) as TFile
						);

						// Add the linked note content to the additional_context map.
						user.additional_context[property] = linkedNoteContent;
					} catch (e) {
						console.log(e);
					}
				}

				const systemFile =
					this.app.vault.getAbstractFileByPath(systemPath);
				let system = systemFile
					? await this.app.vault.read(systemFile as TFile)
					: "You are a helpful assistant.";

				system += "\n\nUse the content in 'input' as the main context, consider the 'additional_context' map for related information, and respond based on the instructions in 'user_prompt'. Assist the user by synthesizing information from these elements into coherent and useful insights or actions.";

				const data = { user: JSON.stringify(user), system };

				console.debug("data: ", data);

				const notice = new Notice(`Running ${flow} Flow...`, 0);
				try {
					const response = await fetch(
						"https://api.cloud-atlas.ai/run",
						{
							headers: {
								"x-api-key": this.settings.apiKey,
							},
							method: "POST",
							body: JSON.stringify(data),
						}
					);
					const respJson = await response.json();
					console.debug("response: ", respJson);
					editor.replaceSelection("\n" + respJson);
				} catch (e) {
					console.log(e);
					notice.hide();
					new Notice("Something went wrong. Check the console.");
				}
				notice.hide();
				clearTimeout(noticeTimeout);
			},
		});
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

// TODO: If we only have one tab, we shouldn't have multiple tabs or this will get rejected when we submit it to the store.
class CloudAtlasGlobalSettingsTab extends PluginSettingTab {
	plugin: CloudAtlasPlugin;

	constructor(app: App, plugin: CloudAtlasPlugin) {
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
