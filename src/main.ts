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
	textNode,
} from "./canvas";
import { AdditionalContext, Payload, User, FlowConfig } from "./interfaces";
import { randomUUID } from "crypto";

const ADDITIONAL_SYSTEM =
	"Use the content in 'input' as the main context, consider the 'additional_context' map for related information, and respond based on the instructions in 'user_prompt'. Assist the user by synthesizing information from these elements into coherent and useful insights or actions.";

interface CloudAtlasPluginSettings {
	apiKey: string;
	previewMode: boolean;
	entityRecognition: boolean;
	generateEmbeddings: boolean;
	canvasResolveLinks: boolean;
	canvasResolveBacklinks: boolean;
}

const DEFAULT_SETTINGS: CloudAtlasPluginSettings = {
	apiKey: "",
	previewMode: false,
	entityRecognition: false,
	generateEmbeddings: false,
	canvasResolveLinks: false,
	canvasResolveBacklinks: false,
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


import { load as parseYaml } from "js-yaml";

export default class CloudAtlasPlugin extends Plugin {
	settings: CloudAtlasPluginSettings;

	parseFlowFile = (content: string) : FlowConfig => {
		const frontMatterRegex = /---\s*([\s\S]*?)\s*---/;
		const match = frontMatterRegex.exec(content);

		let properties: { [key: string]: any } = {}; // Add type assertion here

		if (match) {
			const frontMatter = match[1];
			properties = parseYaml(frontMatter) as { [key: string]: any };
		}

				if (match) {
					const frontMatter = match[1];
					properties = parseYaml(frontMatter) as { [key: string]: string };
				}

				const userPrompt = content.replace(frontMatterRegex, "").trim();
				const system_instructions = properties["system_instructions"] as string ? properties["system_instructions"] : null;
				const mode = properties["mode"] as string ? properties["mode"] : null;
				const resolveBacklinks = properties["resolveBacklinks"] ? properties["resolveBacklinks"] === 'true' : null;
		    const resolveForwardLinks = properties["resolveForwardLinks"] ? properties["resolveForwardLinks"] === 'true' : null;
				const exclusionPatterns = properties["exclusionPatterns"] ? properties["exclusionPatterns"] : [];

				return { userPrompt: userPrompt, system_instructions: system_instructions, mode: mode, resolveBacklinks: resolveBacklinks, resolveForwardLinks: resolveForwardLinks, exclusionPatterns: exclusionPatterns };
	};

	async parseUserFlowFile(flow: string) {
		const userFlowFilePath = `CloudAtlas/${flow}.user_flow`;
		const userFlowFileExists = await this.app.vault.adapter.exists(userFlowFilePath);

		if (userFlowFileExists) {
			const userFlowFileContent = await this.readNote(userFlowFilePath);
			const userFlowConfig = this.parseFlowFile(userFlowFileContent);
			return userFlowConfig;
		}
		return null;
	}

	parseExclusionPatterns = (patterns: string[]): RegExp[] => {
		return patterns.map(pattern => new RegExp(pattern));
	};

	runFlow = async (editor: Editor, flow: string) => {
		const noteFile = this.app.workspace.getActiveFile();
		let input = editor.getSelection();
		let fromSelection = true;

		if (!noteFile) {
			return;
		}
		if (!input) {
			// if there is no text selection, read the content of the current note file.
			input = await this.app.vault.read(noteFile);
			fromSelection = false;
		}

		const flowFilePath = `CloudAtlas/${flow}.flow`;
		const flowFileContent = await this.readNote(flowFilePath);
		const defaultFlowConfig = this.parseFlowFile(flowFileContent);
		const userFlowConfig = await this.parseUserFlowFile(flow);

		let flowConfig : FlowConfig = {
			userPrompt: defaultFlowConfig.userPrompt + '\n' + userFlowConfig?.userPrompt,
			system_instructions: userFlowConfig?.system_instructions || defaultFlowConfig.system_instructions,
			mode: userFlowConfig?.mode || defaultFlowConfig.mode || "append",
			resolveBacklinks: userFlowConfig?.resolveBacklinks || defaultFlowConfig.resolveBacklinks || false,
			resolveForwardLinks: userFlowConfig?.resolveForwardLinks || defaultFlowConfig.resolveForwardLinks || false,
			exclusionPatterns: (defaultFlowConfig.exclusionPatterns).concat(userFlowConfig?.exclusionPatterns || []),
		};

		flowConfig["userPrompt"] = defaultFlowConfig.userPrompt + "\n" + (userFlowConfig?.userPrompt || '');

		if (fromSelection) {
			editor.replaceSelection(
				input +
				"\n\n---\n\n" +
				`\u{1F4C4}\u{2194}\u{1F916}` +
				"\n\n---\n\n"
			);
		} else {
			editor.replaceSelection(
				"\n\n---\n\n" + `\u{1F4C4}\u{2194}\u{1F916}` + "\n\n---\n\n"
			);
		}

		// Initialize the user object with the current page content.
		const user: User = {
			user_prompt: flowConfig.userPrompt,
			input,
			additional_context: {},
		};

		const exclusionPatterns: RegExp[] = this.parseExclusionPatterns(flowConfig?.exclusionPatterns) || [];

		let additionalContext: AdditionalContext = {};

		if (flowConfig.resolveForwardLinks) {
			const resolvedLinks = await this.resolveLinksForPath(noteFile.path, exclusionPatterns);
			Object.assign(additionalContext, resolvedLinks);
		}

		if (flowConfig.resolveBacklinks) {
			const resolvedBacklinks = await this.resolveBacklinksForPath(noteFile.path, exclusionPatterns);
			Object.assign(additionalContext, resolvedBacklinks);
		}

		user.additional_context = additionalContext;

		const data = {
			user,
			system: flowConfig.system_instructions || "You are a helpful assistant.",
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

		console.debug("data: ", data);

		const notice = new Notice(`Running ${flow} Flow ...`, 0);
		animateNotice(notice);

		try {
			const respJson = await this.apiFetch(data);
			const currentNoteContents = await this.app.vault.read(noteFile);
			const output = currentNoteContents.replace(
				`\u{1F4C4}\u{2194}\u{1F916}`,
				respJson
			);

			console.debug("response: ", respJson);
			this.app.vault.modify(noteFile, output);

		} catch (e) {
			console.error(e);
			notice.hide();
			new Notice("Something went wrong. Check the console.");
		}
		notice.hide();
		clearTimeout(noticeTimeout);
	};

	readNote = async (filePath: string): Promise<string> => {
		const content = await this.app.vault.read(
			this.app.vault.getAbstractFileByPath(filePath) as TFile
		);
		return content;
	};

	readAndFilterContent = async (path: string, excludePatterns: RegExp[]): Promise<string> => {
		if (excludePatterns.some(pattern => pattern.test(path))) {
			return ""; // Skip reading if path matches any exclusion pattern
		}
		try {
			return await this.readNote(path);
		} catch (e) {
			console.error(e);
			return "";
		}
	};

	resolveBacklinksForPath = async (
		filePath: string, excludePatterns: RegExp[]
	): Promise<AdditionalContext> => {
		const additionalContext: AdditionalContext = {};
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		const activeBacklinks =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (this.app.metadataCache as any).getBacklinksForFile(file);
		// Process backlinks and resolved links
		const backlinkPromises = Array.from(activeBacklinks.keys()).map(
			async (key: string) => {
				const linkedNoteContent = await this.readAndFilterContent(key, excludePatterns);
				if (linkedNoteContent) {
					additionalContext[key] = linkedNoteContent;
				}
			}
		);
		await Promise.all(backlinkPromises);
		return additionalContext;
	};

	resolveLinksForPath = async (
		filePath: string, excludePatterns: RegExp[]
	): Promise<AdditionalContext> => {
		const additionalContext: AdditionalContext = {};
		const activeResolvedLinks = await this.app.metadataCache.resolvedLinks[
			filePath
		];
		const resolvedLinkPromises = Object.keys(activeResolvedLinks).map(
			async (property) => {
				const linkedNoteContent = await this.readAndFilterContent(property, excludePatterns);
				if (linkedNoteContent) {
					additionalContext[property] = linkedNoteContent;
				}
			}
		);
		await Promise.all(resolvedLinkPromises);
		return additionalContext;
	};

	apiFetch = async (payload: Payload): Promise<string> => {
		const url = this.settings.previewMode
			? "https://dev-api.cloud-atlas.ai/run"
			: "https://api.cloud-atlas.ai/run";
		const response = await fetch(url, {
			headers: {
				"x-api-key": this.settings.apiKey,
			},
			method: "POST",
			body: JSON.stringify(payload),
		});
		const respJson = await response.json();
		return respJson;
	};

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
		await this.create(
			`CloudAtlas/${flow}.canvas`,
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

	canvasOps = async (noteFile: TFile) => {
		const data = await this.runCanvasFlow(noteFile);
		if (!data) {
			return;
		}
		// console.log(data);

		const notice = new Notice(`Running Canvas Flow ...`, 0);
		animateNotice(notice);

		try {
			const respJson = await this.apiFetch(data.payload);

			const responseNode = textNode(respJson);

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
		const additional_context: AdditionalContext = {};
		const promises = filterNodesByType(
			NodeType.Context,
			connectedNodes
		).map(async (node) => {
			const content = await this.getNodeContent(node);
			if (content) {
				additional_context[node.id] = content;
			}
		});
		await Promise.all(promises);

		if ((inputNode as FileNode).file) {
			if (this.settings.canvasResolveLinks) {
				const resolvedLinks = await this.resolveLinksForPath(
					(inputNode as FileNode).file, [] // assuming no exclusions in the canvas flow runner
				);
				Object.assign(additional_context, resolvedLinks);
			}

			if (this.settings.canvasResolveBacklinks) {
				const resolvedBacklinks = await this.resolveBacklinksForPath(
					(inputNode as FileNode).file, [] // assuming no exclusions in the canvas flow runner
				);

				Object.assign(additional_context, resolvedBacklinks);
			}
		}

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

			// Register .flow files as markdown files
			this.registerExtensions(["flow"], "markdown");
			this.registerExtensions(["user_flow"], "markdown");

			await this.createFolder("CloudAtlas");

			const exampleFlowString =
				`---
system_instructions: You are a helpful assistant.
resolveBacklinks: true
resolveForwardLinks: true
exclusionPattern: ["^Private/", ".*-confidential.*"]
---

Say hello to the user.
`
			await this.create("CloudAtlas/example.flow", exampleFlowString);

			await this.createFlow("Example");
			new Notice(
				"Created CloudAtlas folder with an example flow. Please configure the plugin to use it."
			);
		} catch (e) {
			console.log("Could not create folder, it likely already exists");
		}

		const cloudAtlasFlows = await this.app.vault.getFiles()
			.filter(file => file.path.startsWith('CloudAtlas/') && file.extension === 'flow');

		// Create commands for each flow
		cloudAtlasFlows.forEach(flowFile => {
			const flow = flowFile.path.split('/')[1].split('.flow')[0];
			this.addNewCommand(this, flow);
		});

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
						if (!checking) {
							this.canvasOps(noteFile).then(() => { });
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
				this.runFlow(editor, flow).then(() => { });
			},
		});
	}

	onunload() { }

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

		containerEl.createEl("h1", { text: "General" });

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Cloud Atlas API key")
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

		containerEl.createEl("h1", { text: "Canvas Flows" });

		new Setting(containerEl)
			.setName("Resolve links")
			.setDesc("Adds resolved links as additional prompt context")
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
			.setDesc("Adds resolved backlinks as additional prompt context")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.canvasResolveBacklinks)
					.onChange(async (value) => {
						this.plugin.settings.canvasResolveBacklinks = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
