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
import {
	CANVAS_CONTENT,
	CanvasContent,
	FileNode,
	findNodeEdges,
	findInputNode,
	Node,
	TextNode,
	filterNodesByType,
	NodeType,
	CanvasScaffolding,
} from "./canvas";
import { User } from "./interfaces";
import { randomUUID } from "crypto";

const ADDITIONAL_SYSTEM =
	"Use the content in 'input' as the main context, consider the 'additional_context' map for related information, and respond based on the instructions in 'user_prompt'. Assist the user by synthesizing information from these elements into coherent and useful insights or actions.";

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

	getNodeContent = async (node: Node) => {
		if (node.type == "text") {
			return this.getTextNodeContent(node as TextNode);
		} else if (node.type == "file") {
			return this.getFileNodeContent(node as FileNode);
		}
	};

	getTextNodeContent = async (node: TextNode) => {
		return node.text;
	};

	getFileNodeContent = async (node: FileNode) => {
		const nodeFile = this.app.vault.getAbstractFileByPath(node.file);
		const nodeContent = await this.app.vault.read(nodeFile as TFile);
		return nodeContent;
	};

	createFlow = async (flow: string) => {
		await this.createFolder(`CloudAtlas/Flows}`);
		await this.create(
			`CloudAtlas/Flows/${flow}.canvas`,
			JSON.stringify(CANVAS_CONTENT)
		);
	};

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

	canvasOps = async (noteFile) => {
		const data = await this.runCanvasFlow(noteFile);
		if (!data) {
			return;
		}
		// console.log(data);

		const notice = new Notice(`Running Canvas Flow ...`, 0);
		animateNotice(notice);
		try {
			const response = await fetch("https://api.cloud-atlas.ai/run", {
				headers: {
					"x-api-key": this.settings.apiKey,
				},
				method: "POST",
				body: JSON.stringify(data.payload),
			});
			const respJson = await response.json();
			const responseNode = {
				id: randomUUID(),
				type: "text",
				text: respJson,
				x: 0,
				y: 0,
				height: 400,
				width: 400,
			} as TextNode;

			const canvasContentString = await this.app.vault.read(noteFile);
			const canvasContent: CanvasContent =
				JSON.parse(canvasContentString);

			const inputNodes = findInputNode(canvasContent.nodes);

			canvasContent.edges.push({
				id: randomUUID(),
				fromNode: inputNodes[0].id,
				fromSide: "bottom",
				toNode: responseNode.id,
				toSide: "top",
			});

			canvasContent.nodes.push(responseNode);
			this.app.vault.modify(noteFile, JSON.stringify(canvasContent));
			console.debug("response: ", respJson);
		} catch (e) {
			console.log(e);
			notice.hide();
			new Notice("Something went wrong. Check the console.");
		}
		notice.hide();
		clearTimeout(noticeTimeout);
	};

	runCanvasFlow = async (
		canvasFile: TFile
	): Promise<CanvasScaffolding | undefined> => {
		const canvasContentString = await this.app.vault.read(canvasFile);
		const canvasContent: CanvasContent = JSON.parse(canvasContentString);
		// console.log(canvasContent);
		const inputNodes = findInputNode(canvasContent.nodes);
		if (!inputNodes) {
			new Notice("Could not find User(Red) node.");
			return;
		} else if (inputNodes.length > 1) {
			new Notice("Found multiple User(Red) nodes, only one is allowed.");
			return;
		}
		const inputNode = inputNodes[0];
		const inputNodeEdges = findNodeEdges(inputNode, canvasContent.edges);
		const connectedNodeIds = inputNodeEdges.map((edge) => edge.fromNode);
		const connectedNodes = canvasContent.nodes.filter((node) => {
			return connectedNodeIds.includes(node.id);
		});
		// console.log(inputNode);
		// console.log(inputNodeEdges);
		// console.log(connectedNodes);
		const input = await this.getNodeContent(inputNode);
		const user_prompt = [];

		for (const node of filterNodesByType(
			NodeType.UserPrompt,
			connectedNodes
		)) {
			const content = await this.getNodeContent(node);
			if (content) {
				user_prompt.push(content);
			}
		}

		const system_instructions = [];

		for (const node of filterNodesByType(NodeType.System, connectedNodes)) {
			const content = await this.getNodeContent(node);
			if (content) {
				system_instructions.push(content);
			}
		}

		system_instructions.push(ADDITIONAL_SYSTEM);

		const additional_context = {};
		const promises = filterNodesByType(
			NodeType.Context,
			connectedNodes
		).map(async (node) => {
			additional_context[node.id] = await this.getNodeContent(node);
		});
		await Promise.all(promises);

		const user: User = {
			user_prompt: user_prompt.join("\n"),
			input: input ? input : "",
			additional_context,
		};

		return {
			payload: {
				user: user,
				system: system_instructions.join("\n"),
			},
			canvas: canvasContent,
		};
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

			await this.createFlow("Example");

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
			id: `run-canvas-flow`,
			name: `Run Canvas Flow`,
			checkCallback: (checking: boolean) => {
				// console.log("checking: ", checking);
				const noteFile = this.app.workspace.getActiveFile();
				if (noteFile) {
					if (noteFile.path.endsWith(".canvas")) {
						// console.log("Command can run");
						if (!checking) {
							// console.log("Running command");
							this.canvasOps(noteFile).then(() => {});
						}
						return true;
					}
				}
			},
		});

		this.addCommand({
			id: `run-flow-${flow}`,
			name: `Run ${flow} Flow`,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				let input = editor.getSelection();
				let fromSelection = true;
				const noteFile = this.app.workspace.getActiveFile();
				if (!noteFile) {
					return;
				}
				if (!input) {
					// if there is no text selection, read the content of the current note file.
					input = await this.app.vault.read(noteFile);
					fromSelection = false;
				}
				// console.log(input);

				const userPromptPath = `CloudAtlas/${flow}/user_prompt.md`;
				const systemPath = `CloudAtlas/${flow}/system.md`;

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
					.resolvedLinks[noteFile.path];

				const activeBacklinks =
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (this.app.metadataCache as any).getBacklinksForFile(
						noteFile
					);

				// Process backlinks and resolved links
				const backlinkPromises = Array.from(activeBacklinks.keys()).map(
					async (key: string) => {
						try {
							const linkedNoteContent = await this.app.vault.read(
								this.app.vault.getAbstractFileByPath(
									key
								) as TFile
							);
							user.additional_context[key] = linkedNoteContent;
						} catch (e) {
							console.log(e);
						}
					}
				);

				const resolvedLinkPromises = Object.keys(
					activeResolvedLinks
				).map(async (property) => {
					try {
						const linkedNoteContent = await this.app.vault.read(
							this.app.vault.getAbstractFileByPath(
								property
							) as TFile
						);
						user.additional_context[property] = linkedNoteContent;
					} catch (e) {
						console.log(e);
					}
				});

				const systemFile =
					this.app.vault.getAbstractFileByPath(systemPath);
				let system = systemFile
					? await this.app.vault.read(systemFile as TFile)
					: "You are a helpful assistant.";

				system += "\n\n" + ADDITIONAL_SYSTEM;

				const data = {
					user,
					system,
					options: {
						entity_recognition: false,
						generate_embeddings: false,
					},
				};

				if (this.settings.entityRecognition) {
					data.options.entity_recognition = true as const;
				}

				if (this.settings.generateEmbeddings) {
					data.options.generate_embeddings = true as const;
				}

				await Promise.all([
					...backlinkPromises,
					...resolvedLinkPromises,
				]);

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
						await this.plugin.saveSettings();
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
						await this.plugin.saveSettings();
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
						await this.plugin.saveSettings();
					})
			);
	}
}
