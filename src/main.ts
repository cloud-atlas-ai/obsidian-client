import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
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

function joinStrings(
	first: string | undefined,
	second: string | undefined
): string {
	return [first, second].filter((s) => s).join("\n");
}

function combinePayloads(
	base: Payload | null,
	override: Payload | null
): Payload {
	if (!base) {
		if (!override) {
			throw new Error("No base or override payload");
		}
		return override;
	}

	if (!override) {
		return base;
	}
	const additional_context: AdditionalContext = {};
	Object.assign(additional_context, base.user.additional_context);
	Object.assign(additional_context, override.user.additional_context);

	const input = joinStrings(base.user.input, override.user.input);
	const user_prompt = joinStrings(
		base.user.user_prompt,
		override.user.user_prompt
	);

	const user: User = {
		user_prompt,
		input,
		additional_context,
	};

	return {
		user,
		system: override.system || base.system,
	};
}

export default class CloudAtlasPlugin extends Plugin {
	settings: CloudAtlasPluginSettings;

	pathToPayload = async (
		filePath: string,
		input?: string,
		previousConfig?: FlowConfig
	): Promise<{ payload: Payload; config: FlowConfig }> => {
		const flowConfig = await this.flowConfigFromPath(filePath);
		const flowFile = this.app.vault.getAbstractFileByPath(
			filePath
		) as TFile;

		if (previousConfig) {
			if (flowConfig?.resolveForwardLinks === undefined) {
				flowConfig.resolveForwardLinks =
					previousConfig.resolveForwardLinks;
			}
			if (flowConfig?.resolveBacklinks === undefined) {
				flowConfig.resolveBacklinks = previousConfig.resolveBacklinks;
			}
		}

		let flowContent = await this.app.vault.read(flowFile);
		flowContent = flowContent
			.substring(flowConfig.frontMatterOffset)
			.trim();

		console.log(flowContent, flowConfig.frontMatterOffset);

		// Support input from selection
		input = input ? input : flowContent;

		const user: User = {
			user_prompt: flowConfig.userPrompt,
			input,
			additional_context: {},
		};

		console.debug(user);

		const exclusionPatterns: RegExp[] =
			this.parseExclusionPatterns(flowConfig?.exclusionPatterns) || [];

		const additionalContext: AdditionalContext = {};

		if (flowConfig.resolveForwardLinks) {
			const resolvedLinks = await this.resolveLinksForPath(
				filePath,
				exclusionPatterns
			);
			Object.assign(additionalContext, resolvedLinks);
		}

		if (flowConfig.resolveBacklinks) {
			const resolvedBacklinks = await this.resolveBacklinksForPath(
				filePath,
				exclusionPatterns
			);
			Object.assign(additionalContext, resolvedBacklinks);
		}

		user.additional_context = additionalContext;

		const data = {
			user,
			system: flowConfig.system_instructions,
			options: {
				entity_recognition: false,
				generate_embeddings: false,
			},
		};

		return { payload: data, config: flowConfig };
	};

	flowConfigFromPath = async (filePath: string): Promise<FlowConfig> => {
		const metadata = await this.app.metadataCache.getFileCache(
			(await this.app.vault.getAbstractFileByPath(filePath)) as TFile
		);
		console.debug(metadata);

		return {
			userPrompt: metadata?.frontmatter?.userPrompt,
			system_instructions: metadata?.frontmatter?.system_instructions,
			mode: metadata?.frontmatter?.mode,
			resolveBacklinks: metadata?.frontmatter?.resolveBacklinks,
			resolveForwardLinks: metadata?.frontmatter?.resolveForwardLinks,
			exclusionPatterns: metadata?.frontmatter?.exclusionPatterns || [],
			frontMatterOffset: metadata?.frontmatterPosition?.end?.offset || 0,
		};
	};

	parseExclusionPatterns = (patterns: string[]): RegExp[] => {
		return patterns.map((pattern) => new RegExp(pattern));
	};

	runFlow = async (editor: Editor, flow: string) => {
		const inputFlowFile = this.app.workspace.getActiveFile();
		const templateFlowFilePath = `CloudAtlas/${flow}.flow.md`;
		const dataFlowFilePath = `CloudAtlas/${flow}.md`;
		const dataIsInput = inputFlowFile?.path === dataFlowFilePath;

		const input = editor.getSelection();
		const fromSelection = Boolean(input);

		if (!inputFlowFile) {
			return;
		}

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

		const { payload: templateFlowPayload, config: templateFlowConfig } =
			await this.pathToPayload(templateFlowFilePath);

		const { payload: dataFlowPayload, config: dataFlowConfig } = dataIsInput
			? { payload: null, config: templateFlowConfig }
			: await this.pathToPayload(dataFlowFilePath);

		const { payload: inputPayload } = await this.pathToPayload(
			inputFlowFile.path,
			input,
			dataFlowConfig
		);

		let payload = combinePayloads(templateFlowPayload, dataFlowPayload);
		payload = combinePayloads(payload, inputPayload);

		payload.options = payload.options || {};
		payload.options.entity_recognition = this.settings.entityRecognition;
		payload.options.generate_embeddings = this.settings.generateEmbeddings;

		console.debug("data: ", payload);

		const notice = new Notice(`Running ${flow} Flow ...`, 0);
		animateNotice(notice);

		try {
			const respJson = await this.apiFetch(payload);
			const currentNoteContents = await this.app.vault.read(
				inputFlowFile
			);
			const output = currentNoteContents.replace(
				`\u{1F4C4}\u{2194}\u{1F916}`,
				respJson
			);

			console.debug("response: ", respJson);
			this.app.vault.modify(inputFlowFile, output);
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

	readAndFilterContent = async (
		path: string,
		excludePatterns: RegExp[]
	): Promise<string> => {
		if (excludePatterns.some((pattern) => pattern.test(path))) {
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
		filePath: string,
		excludePatterns: RegExp[]
	): Promise<AdditionalContext> => {
		const additionalContext: AdditionalContext = {};
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;

		const activeBacklinks =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (this.app.metadataCache as any).getBacklinksForFile(file);
		// Process backlinks and resolved links
		const backlinkPromises = Array.from(activeBacklinks.keys()).map(
			async (key: string) => {
				const linkedNoteContent = await this.readAndFilterContent(
					key,
					excludePatterns
				);
				if (linkedNoteContent) {
					additionalContext[key] = linkedNoteContent;
				}
			}
		);
		await Promise.all(backlinkPromises);
		return additionalContext;
	};

	resolveLinksForPath = async (
		filePath: string,
		excludePatterns: RegExp[]
	): Promise<AdditionalContext> => {
		const additionalContext: AdditionalContext = {};
		const activeResolvedLinks = await this.app.metadataCache.resolvedLinks[
			filePath
		];
		const resolvedLinkPromises = Object.keys(activeResolvedLinks).map(
			async (property) => {
				const linkedNoteContent = await this.readAndFilterContent(
					property,
					excludePatterns
				);
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
				"Content-Type": "application/json",
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
					(inputNode as FileNode).file,
					[] // assuming no exclusions in the canvas flow runner
				);
				Object.assign(additional_context, resolvedLinks);
			}

			if (this.settings.canvasResolveBacklinks) {
				const resolvedBacklinks = await this.resolveBacklinksForPath(
					(inputNode as FileNode).file,
					[] // assuming no exclusions in the canvas flow runner
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
			// this.registerExtensions(["flow"], "markdown");

			await this.createFolder("CloudAtlas");

			const exampleFlowString = `---
system_instructions: You are a helpful assistant.
resolveBacklinks: true
resolveForwardLinks: true
exclusionPattern: ["^Private/", ".*-confidential.*"]
---

Say hello to the user.
`;
			await this.create("CloudAtlas/example.flow", exampleFlowString);

			await this.createFlow("Example");
			new Notice(
				"Created CloudAtlas folder with an example flow. Please configure the plugin to use it."
			);
		} catch (e) {
			console.log("Could not create folder, it likely already exists");
		}

		const cloudAtlasFlows = await this.app.vault
			.getFiles()
			.filter(
				(file) =>
					file.path.startsWith("CloudAtlas/") &&
					file.path.endsWith("flow.md")
			);

		// Create commands for each flow
		cloudAtlasFlows.forEach((flowFile) => {
			const flow = flowFile.path.split("/")[1].split(".flow")[0];
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
				this.runFlow(editor, flow).then(() => {});
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
