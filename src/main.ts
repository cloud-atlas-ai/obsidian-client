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

interface CloudAtlasPluginSettings {
	apiKey: string;
	previewMode: boolean;
	entityRecognition: boolean;
	generateEmbeddings: boolean;
}

const DEFAULT_SETTINGS: CloudAtlasPluginSettings = {
	apiKey: "",
	previewMode: false,
	entityRecognition: false,
	generateEmbeddings: false,
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

	createFolder = async (path: string) => {
		try {
			await this.app.vault.createFolder("CloudAtlas");
		} catch (e) {
			console.debug(e);
		}
	};

	create = async (path: string, content: string) => {
		try {
			await this.app.vault.create(path, content);
		} catch (e) {
			console.debug(e);
		}
	};

	async onload() {
		await this.loadSettings();

		try {
			await this.createFolder("CloudAtlas");
			await this.createFolder("CloudAtlas/example");
			await this.create(
				"CloudAtlas/example/system.md",
				"You are a helpful assistant."
			);

			await this.create(
				"CloudAtlas/example/user.md",
				"What is Cloud Atlas? [[additional context]]\n"
			);
			await this.create("CloudAtlas/example/user_prompt.md", "");
			await this.create(
				"CloudAtlas/example/additional context.md",
				"I mean the novel."
			);
			await this.create(
				"CloudAtlas/example/backlink.md",
				"[[user]]\n\nActually write about the movie as well, but prefix the movie writeup with"
			);

			new Notice(
				"Created CloudAtlas folder with an example flow. Please configure the plugin to use it."
			);
		} catch (e) {
			console.log("Could not create folder, it likely already exists");
		}

		const cloudAtlasFolder =
			this.app.vault.getAbstractFileByPath("CloudAtlas");
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
				const userPath = `CloudAtlas/${flow}/user.md`;
				const userPromptPath = `CloudAtlas/${flow}/user_prompt.md`;
				const systemPath = `CloudAtlas/${flow}/system.md`;

				let input = editor.getSelection();
				let fromSelection = true;
				const userFile = this.app.vault.getAbstractFileByPath(userPath);
				if (!userFile) {
					return;
				}
				if (!input) {
					// if there is no text selection, read the content of the current note file.
					input = await this.app.vault.read(userFile as TFile);
					fromSelection = false;
				}
				// console.log(input);
				const userPromptFile =
					this.app.vault.getAbstractFileByPath(userPromptPath);
				const userPrompt = userPromptFile
					? await this.app.vault.read(userPromptFile as TFile)
					: "";

				// Initialize the user object with the current page content.
				const user: {
					user_prompt: string;
					input: string;
					additional_context: { [key: string]: string };
				} = {
					user_prompt: userPrompt,
					input,
					additional_context: {},
				};

				// Get resolved links from the current note file.
				const activeResolvedLinks = await this.app.metadataCache
					.resolvedLinks[userFile.path];

				const activeBacklinks =
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (this.app.metadataCache as any).getBacklinksForFile(
						userFile
					);
				activeBacklinks.keys().forEach(async (key: string) => {
					try {
						const linkedNoteContent = await this.app.vault.read(
							this.app.vault.getAbstractFileByPath(key) as TFile
						);

						// Add the linked note content to the additional_context map.
						user.additional_context[key] = linkedNoteContent;
					} catch (e) {
						console.log(e);
					}
				});

				// console.log(activeBacklinks.data);

				// Process each resolved link.
				for (const property in activeResolvedLinks) {
					try {
						const linkedNoteContent = await this.app.vault.read(
							this.app.vault.getAbstractFileByPath(
								property
							) as TFile
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

				system +=
					"\n\nUse the content in 'input' as the main context, consider the 'additional_context' map for related information, and respond based on the instructions in 'user_prompt'. Assist the user by synthesizing information from these elements into coherent and useful insights or actions.";

				const data = { user, system, options: {} };

				if (this.settings.entityRecognition) {
					data.options["entity_recognition"] = true;
				}

				if (this.settings.generateEmbeddings) {
					data.options["generate_embeddings"] = true;
				}

				console.debug("data: ", data);

				const notice = new Notice(`Running ${flow} Flow ...`, 0);
				animateNotice(notice);
				const url = this.settings.previewMode
					? "https://dev-api.cloud-atlas.ai/run"
					: "https://api.cloud-atlas.ai/run";
				try {
					const response = await fetch(url, {
						headers: {
							"x-api-key": this.settings.apiKey,
						},
						method: "POST",
						body: JSON.stringify(data),
					});
					const respJson = await response.json();
					console.debug("response: ", respJson);
					if (fromSelection) {
						editor.replaceSelection(
							input + "\n\n---\n\n" + respJson + "\n\n---\n\n"
						);
					} else {
						editor.replaceSelection("\n\n---\n\n" + respJson);
					}
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

		new Setting(containerEl)
			.setName("Preview mode")
			.setDesc("Use unstable API with more features and less stability")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.previewMode)
					.onChange(async (value) => {
						this.plugin.settings.previewMode = value;
					})
			);

		new Setting(containerEl)
			.setName("Entity recognition")
			.setDesc(
				"Run named entity recognition on submitted notes, results in more relevant context entries, leading to more useful returns"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.entityRecognition)
					.onChange(async (value) => {
						this.plugin.settings.entityRecognition = value;
					})
			);

		new Setting(containerEl)
			.setName("Generate embeddings")
			.setDesc(
				"Generate embeddings for submitted notes, allows us to use retrieveal augmented generation"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.generateEmbeddings)
					.onChange(async (value) => {
						this.plugin.settings.generateEmbeddings = value;
					})
			);
	}
}
