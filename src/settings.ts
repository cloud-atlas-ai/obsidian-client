import { App, PluginSettingTab, Setting } from "obsidian";
import CloudAtlasPlugin from "./main";
import { NamedEntity } from "./interfaces";

export interface CloudAtlasPluginSettings {
	apiKey: string;
	useOpenAi: boolean;
	previewMode: boolean;
	entityRecognition: boolean;
	generateEmbeddings: boolean;
	wikify: string[];
	canvasResolveLinks: boolean;
	canvasResolveBacklinks: boolean;
	developmentMode: boolean;
}

// TODO: If we only have one tab, we shouldn't have multiple tabs or this will get rejected when we submit it to the store.
export class CloudAtlasGlobalSettingsTab extends PluginSettingTab {
	plugin: CloudAtlasPlugin;

	constructor(app: App, plugin: CloudAtlasPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	wikifySetting = (containerEl: HTMLElement, namedEntity: NamedEntity) => {
		new Setting(containerEl)
			.setName(namedEntity)
			.setDesc("Convert entity names into wikilinks.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.wikify.includes(namedEntity))
					.onChange(async (value) => {
						// Check if value is already in array, remove if so, add if not
						if (value) {
							this.plugin.settings.wikify.push(namedEntity);
						} else {
							this.plugin.settings.wikify =
								this.plugin.settings.wikify.filter(
									(entity) => entity !== namedEntity
								);
						}
						console.log(this.plugin.settings.wikify);
						await this.plugin.saveSettings();
					})
			);
	};

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Cloud Atlas API key.")
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
			.setName("Use OpenAi")
			.setDesc(
				"We use AzureAi by default, this will use OpenAi, models are identical, so there should not be a meaningful difference in results."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useOpenAi)
					.onChange(async (value) => {
						this.plugin.settings.useOpenAi = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Preview mode")
			.setDesc("Use unstable API with more features and less stability.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.previewMode)
					.onChange(async (value) => {
						this.plugin.settings.previewMode = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Entity recognition")
			.setDesc(
				"Run named entity recognition on submitted notes, results in more relevant context entries, leading to more useful returns."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.entityRecognition)
					.onChange(async (value) => {
						this.plugin.settings.entityRecognition = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Generate embeddings")
			.setDesc(
				"Generate embeddings for submitted notes, allows us to use retrieveal augmented generation."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.generateEmbeddings)
					.onChange(async (value) => {
						this.plugin.settings.generateEmbeddings = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h2", { text: "Wikify" });

		this.wikifySetting(containerEl, NamedEntity.Person);
		this.wikifySetting(containerEl, NamedEntity.Location);

		containerEl.createEl("h2", { text: "Canvas Flows" });

		new Setting(containerEl)
			.setName("Resolve links")
			.setDesc("Adds resolved links as additional prompt context.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.canvasResolveLinks)
					.onChange(async (value) => {
						this.plugin.settings.canvasResolveLinks = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Resolve backlinks")
			.setDesc("Adds resolved backlinks as additional prompt context.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.canvasResolveBacklinks)
					.onChange(async (value) => {
						this.plugin.settings.canvasResolveBacklinks = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h2", { text: "Development" });
		new Setting(containerEl)
			.setName("Development mode")
			.setDesc("Redirects requests to http://localhost:8787")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.developmentMode)
					.onChange(async (value) => {
						this.plugin.settings.developmentMode = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
