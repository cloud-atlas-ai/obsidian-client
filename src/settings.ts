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
	useVertexAi: boolean;
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
	autoProcessing: {
		enabled: boolean;
		defaultFlow: string;
	};
	interactivePanel: {
		resolveLinks: boolean;
		resolveBacklinks: boolean;
		expandUrls: boolean;
	};
	createNewFile: boolean;
	outputFileTemplate: string;
	autoModel: boolean;
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
				.setName("Use best model for the flow")
				.setDesc(
					"Let Cloud Atlas choose the best model for each flow based on its requirements."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.autoModel || false)
						.onChange(async (value) => {
							this.plugin.settings.autoModel = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Use VertexAi (Google Gemini)")
				.setDesc(
					"Use Google Gemini, currently Gemini 1.5 Pro with 2m token window"
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.useVertexAi)
						.onChange(async (value) => {
							this.plugin.settings.useVertexAi = value;
							if (value === true) {
								this.plugin.settings.useOpenAi = false;
								this.display();
							}
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
				.setName("LLM max response tokens")
				.setDesc(
					"Set maximum tokens returned in the response, defaults to 2000, and maximum is 200000."
				)
				.addText((text) =>
					text
						.setValue(
							this.plugin.settings.llmOptions.max_tokens?.toString() ||
								"5000"
						)
						.onChange(async (value) => {
							const v =
								Number(value) > 200000 ? 200000 : Number(value);
							this.plugin.settings.llmOptions.max_tokens = v;
							await this.plugin.saveSettings();
						})
				);

			// Add new settings for flow response handling
			containerEl.createEl("h2", { text: "Flow Response Handling" });
			
			new Setting(containerEl)
				.setName("Create new file for responses")
				.setDesc("Create a new file for each flow response instead of appending to the current file")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.createNewFile || false)
						.onChange(async (value) => {
							this.plugin.settings.createNewFile = value;
							await this.plugin.saveSettings();
							this.display();
						})
				);
			
			// Only show output file template if createNewFile is enabled
			if (this.plugin.settings.createNewFile) {
				new Setting(containerEl)
					.setName("Output file template")
					.setDesc("Template for naming output files. Available variables: ${flow} ${model} ${basename} (current file name), ${timestamp} (Unix timestamp for better sorting)")
					.addText((text) =>
						text
							.setValue(this.plugin.settings.outputFileTemplate || "${model}-${flow}-${basename}-${timestamp}")
							.onChange(async (value) => {
								this.plugin.settings.outputFileTemplate = value;
								await this.plugin.saveSettings();
							})
					);
			}

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

				// Interactive Panel Settings
				containerEl.createEl("h2", { text: "Interactive Panel" });

				new Setting(containerEl)
					.setName("Resolve links")
					.setDesc(
						"Add linked notes as additional context in interactive panel"
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.interactivePanel
									.resolveLinks
							)
							.onChange(async (value) => {
								this.plugin.settings.interactivePanel.resolveLinks =
									value;
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Resolve backlinks")
					.setDesc(
						"Add backlinks as additional context in interactive panel"
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.interactivePanel
									.resolveBacklinks
							)
							.onChange(async (value) => {
								this.plugin.settings.interactivePanel.resolveBacklinks =
									value;
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Expand URLs")
					.setDesc(
						"Fetch and include content from URLs found in notes and prompt"
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.interactivePanel.expandUrls
							)
							.onChange(async (value) => {
								this.plugin.settings.interactivePanel.expandUrls =
									value;
								await this.plugin.saveSettings();
							})
					);

				containerEl.createEl("h2", { text: "Auto-Processing" });

				new Setting(containerEl)
					.setName("Enable Auto-Processing")
					.setDesc(
						"Automatically process files added to 'sources' subfolders"
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.autoProcessing.enabled
							)
							.onChange(async (value) => {
								this.plugin.settings.autoProcessing.enabled =
									value;
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
