import { App, PluginSettingTab, Setting } from "obsidian";
import CloudAtlasPlugin from "./main";
import {
	AzureAiSettings,
	LlmOptions,
	NamedEntity,
	OpenAiSettings,
} from "./interfaces";

export interface CloudAtlasPluginSettings {
	apiKey: string;
	advancedOptions: boolean;
	useOpenAi: boolean;
	previewMode: boolean;
	entityRecognition: boolean;
	generateEmbeddings: boolean;
	wikify: string[];
	canvasResolveLinks: boolean;
	canvasResolveBacklinks: boolean;
	developmentMode: boolean;
	llmOptions: LlmOptions;
	timeoutMins: number;
	openAiSettings: OpenAiSettings;
	azureAiSettings: AzureAiSettings;
	provider: string;
	registeredFlows: string[];
}

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
			.setName("Provider")
			.setDesc("Choose the LLM provider")
			.addDropdown((dropDown) => {
				dropDown.addOption("openai", "OpenAI");
				// dropDown.addOption('azureai', 'AzureAI');
				dropDown.addOption("cloudatlas", "Cloud Atlas");
				dropDown.setValue(this.plugin.settings.provider);
				dropDown.onChange(async (value) => {
					this.plugin.settings.provider = value;
					this.display();
					await this.plugin.saveSettings();
				});
			});

		if (this.plugin.settings.provider === "openai") {
			containerEl.createEl("h2", { text: "OpenAI" });

			new Setting(containerEl)
				.setName("OpenAI API Key")
				.setDesc(
					"Provision an API key at https://platform.openai.com/api-keys."
				)
				.addText((text) =>
					text
						.setPlaceholder("Enter OpenAI API key")
						.setValue(
							this.plugin.settings.openAiSettings.apiKey.substring(
								0,
								8
							) + "..."
						)
						.onChange(async (value) => {
							this.plugin.settings.openAiSettings.apiKey = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Model ID")
				.setDesc("Open AI model ID, for example 'gpt-4-vision-preview'")
				.addText((text) => {
					text.setValue(
						this.plugin.settings.openAiSettings.modelId
					).onChange(async (value) => {
						this.plugin.settings.openAiSettings.modelId = value;
						await this.plugin.saveSettings();
					});
				});
		}

		if (this.plugin.settings.provider === "azureai") {
			containerEl.createEl("h2", { text: "AzureAI" });

			new Setting(containerEl)
				.setName("AzureAI API Key")
				.setDesc(
					"Get it from the 'Keys & Endpoint' section, visible when viewing a resource on Azure Portal'"
				)
				.addText((text) =>
					text
						.setPlaceholder("Enter AzureAi API key")
						.setValue(
							this.plugin.settings.azureAiSettings.apiKey.substring(
								0,
								8
							) + "..."
						)
						.onChange(async (value) => {
							this.plugin.settings.azureAiSettings.apiKey = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Deployment ID")
				.setDesc(
					"Azure AI deployment ID, can be found at https://oai.azure.com/, under 'Management -> Deployments'"
				)
				.addText((text) => {
					text.setValue(
						this.plugin.settings.azureAiSettings.deploymentId
					).onChange(async (value) => {
						this.plugin.settings.azureAiSettings.deploymentId =
							value;
						await this.plugin.saveSettings();
					});
				});

			new Setting(containerEl)
				.setName("Endpoint")
				.setDesc(
					"Azure AI endpoint, found under the 'Keys & Endpoint' when viewing a resource on Azure Portal"
				)
				.addText((text) => {
					text.setValue(
						this.plugin.settings.azureAiSettings.endpoint
					).onChange(async (value) => {
						this.plugin.settings.azureAiSettings.endpoint = value;
						await this.plugin.saveSettings();
					});
				});
		}

		// Cloud Atlas Settigs
		if (this.plugin.settings.provider === "cloudatlas") {
			containerEl.createEl("h2", { text: "Cloud Atlas" });

			new Setting(containerEl)
				.setName("Cloud Atlas API Key")
				.setDesc("Use Cloud Atlas backend service")
				.addText((text) =>
					text
						.setPlaceholder("Enter API key")
						.setValue(
							this.plugin.settings.apiKey.substring(0, 8) + "..."
						)
						.onChange(async (value) => {
							this.plugin.settings.apiKey = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Preview mode")
				.setDesc(
					"Use unstable API with more features and less stability."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.previewMode)
						.onChange(async (value) => {
							this.plugin.settings.previewMode = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Use OpenAI")
				.setDesc(
					"We use AzureAI by default, this will use OpenAI, models are identical, so there should not be a meaningful difference in results."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.useOpenAi)
						.onChange(async (value) => {
							this.plugin.settings.useOpenAi = value;
							await this.plugin.saveSettings();
						})
				);
		}
		new Setting(containerEl)
			.setName("Advanced Options")
			.setDesc("Show advanced options.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.advancedOptions)
					.onChange(async (value) => {
						this.plugin.settings.advancedOptions = value;
						this.display();
						await this.plugin.saveSettings();
					});
			});
		if (this.plugin.settings.advancedOptions) {
			containerEl.createEl("h2", { text: "LLM" });

			new Setting(containerEl)
				.setName("LLM temperature")
				.setDesc(
					'Set default temperature for the LLM, the higher the temperature the more "creative" the LLM will be, default is usually around 0.8.'
				)
				.addText((text) =>
					text
						.setValue(
							this.plugin.settings.llmOptions.temperature?.toString() ||
								"0.8"
						)
						.onChange(async (value) => {
							this.plugin.settings.llmOptions.temperature =
								Number(value);
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("LLM max response tokens")
				.setDesc(
					"Set maximum tokens returned in the response, defaults to 2000, and maximum is 4096."
				)
				.addText((text) =>
					text
						.setValue(
							this.plugin.settings.llmOptions.max_tokens?.toString() ||
								"2000"
						)
						.onChange(async (value) => {
							const v =
								Number(value) > 4096 ? 4096 : Number(value);
							this.plugin.settings.llmOptions.max_tokens = v;
							await this.plugin.saveSettings();
						})
				);

			if (this.plugin.settings.provider === "cloudatlas") {
				new Setting(containerEl)
					.setName("Timeout minutes")
					.setDesc(
						"How many minutes to wait for the results from server side processing. Obsidian will poll the server every 5 seconds, until results are returned or timeout is reached, defaults to 5 minutes."
					)
					.addText((text) =>
						text
							.setValue(
								this.plugin.settings.timeoutMins.toString()
							)
							.onChange(async (value) => {
								this.plugin.settings.timeoutMins =
									Number(value);
								await this.plugin.saveSettings();
							})
					);
				containerEl.createEl("h2", { text: "Canvas flows" });

				new Setting(containerEl)
					.setName("Resolve links")
					.setDesc(
						"Adds resolved links as additional prompt context, specific to canvas flows."
					)
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
					.setDesc(
						"Adds resolved backlinks as additional prompt context, specific to canvas flows."
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.canvasResolveBacklinks
							)
							.onChange(async (value) => {
								this.plugin.settings.canvasResolveBacklinks =
									value;
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
				containerEl.createEl("h2", { text: "Register commands" });
				const vaultFiles = this.app.vault.getMarkdownFiles();
				const cloudAtlasFlows = vaultFiles.filter(
					(file) =>
						file.path.startsWith("CloudAtlas/") &&
						file.path.endsWith(".flow.md")
				);
				cloudAtlasFlows.forEach((flow) => {
					const name = flow.path.split("/")[1].split(".flow.md")[0];
					new Setting(containerEl)
						.setName(name)
						.setDesc(`Register ${name} command`)
						.addToggle((toggle) => {
							toggle
								.setValue(
									this.plugin.settings.registeredFlows.indexOf(
										name
									) > -1
								)
								.onChange(async (value) => {
									if (value) {
										this.plugin.settings.registeredFlows.push(
											name
										);
									} else {
										this.plugin.settings.registeredFlows =
											this.plugin.settings.registeredFlows.filter(
												(flow) => flow !== name
											);
									}
									await this.plugin.saveSettings();
								});
						});
				});
			}
		}
	}
}
