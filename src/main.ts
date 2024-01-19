import {
	App,
	Editor,
	FileSystemAdapter,
	FileView,
	ItemView,
	LinkCache,
	MarkdownView,
	MetadataCache,
	Notice,
	Plugin,
	TFile,
	normalizePath,
} from "obsidian";
import {
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
	payloadToGraph,
	isFileNode,
} from "./canvas";

import ShortUniqueId from "short-unique-id";
import { ViewUpdate, EditorView, ViewPlugin } from "@codemirror/view";

import {
	AdditionalContext,
	Payload,
	User,
	FlowConfig,
	PayloadConfig,
	LlmOptions,
	ResponseRow,
} from "./interfaces";
import { randomUUID } from "crypto";
import {
	combinePayloads,
	getFileContents,
	getImageContent,
	getWordContents,
	isImage,
	isOtherText,
	isWord,
	joinStrings,
  getFileByPath,
  getBacklinksForFile,
} from "./utils";
import {
	CloudAtlasGlobalSettingsTab,
	CloudAtlasPluginSettings,
} from "./settings";
import {
	ADDITIONAL_SYSTEM,
	CANVAS_CONTENT,
	DEFAULT_SETTINGS,
	SUPABASE_ANON_KEY,
	SUPABASE_URL,
	exampleFlowString,
} from "./constants";
import { Extension } from "@codemirror/state";
import { randomName } from "./namegenerator";
import { azureAiFetch, openAiFetch } from "./byollm";

let noticeTimeout: NodeJS.Timeout;

const animateNotice = (notice: Notice) => {
	let message = notice.noticeEl.innerText;
	const dots = [...message].filter((c) => c === ".").length;
	if (dots == 0) {
		message = message.replace("    ", " .  ");
	} else if (dots == 1) {
		message = message.replace(" .  ", " .. ");
	} else if (dots == 2) {
		message = message.replace(" .. ", " ...");
	} else if (dots == 3) {
		message = message.replace(" ...", "    ");
	}
	notice.setMessage(message);
	noticeTimeout = setTimeout(() => animateNotice(notice), 500);
};

export default class CloudAtlasPlugin extends Plugin {
	settings: CloudAtlasPluginSettings;

	collectInputsIntoPayload = async (
		input: string | null,
		inputFlowFile: TFile,
		flow: string
	): Promise<Payload | null> => {
		const templateFlowFilePath = normalizePath(
			`CloudAtlas/${flow}.flow.md`
		);
		const dataFlowFilePath = normalizePath(
			`CloudAtlas/${flow}.flowdata.md`
		);

		const flows = [
			templateFlowFilePath,
			dataFlowFilePath,
			inputFlowFile.path,
		];

		const payload = await this.combineFlows(flows, input);

		return payload;
	};

	combineFlows = async (
		paths: string[],
		input: string | null
	): Promise<Payload | null> => {
		const uniquePaths = [...new Set(paths)];
		const payloadConfig: PayloadConfig = {
			payload: {
				user: { input, user_prompt: null },
				system: null,
				options: {
					generate_embeddings: this.settings.generateEmbeddings,
					entity_recognition: this.settings.entityRecognition,
					wikify: this.settings.wikify,
				},
				provider: this.settings.useOpenAi ? "openai" : "azureai",
				llmOptions: {
					temperature: this.settings.llmOptions.temperature,
					max_tokens: this.settings.llmOptions.max_tokens,
				},
				requestId: new ShortUniqueId({ length: 10 }).rnd(),
			},
			config: {
				userPrompt: null,
				system_instructions: null,
				mode: null,
				resolveBacklinks: true,
				resolveForwardLinks: true,
				exclusionPatterns: [],
				frontMatterOffset: 0,
				llmOptions: {
					temperature: this.settings.llmOptions.temperature,
					max_tokens: this.settings.llmOptions.max_tokens,
				},
			},
		};

		const inputConfig = { selectionInput: input, is_prompt: true };
		const last_index = uniquePaths.length - 1;
		let index = 0;
		for (const path of uniquePaths) {
			if (index == last_index) {
				inputConfig.is_prompt = false;
			}
			const { payload, config } = await this.pathToPayload(
				path,
				payloadConfig,
				inputConfig
			);
			if (payload) {
				payloadConfig.payload = combinePayloads(
					payloadConfig.payload,
					payload
				);
				payloadConfig.config = config;
			}
			index++;
		}

		return payloadConfig.payload;
	};

	pathToPayload = async (
		filePath: string,
		payloadConfig: PayloadConfig,
		inputConfig?: { selectionInput: string | null; is_prompt: boolean }
	): Promise<PayloadConfig> => {
		const previousConfig = payloadConfig.config;
		const previousPayload = payloadConfig.payload;

		try {
			const flowConfig = await this.flowConfigFromPath(filePath);
			const flowFile = getFileByPath(filePath, this.app);

			// Inherit booleans unless specifically defined.
			if (previousConfig) {
				if (flowConfig?.resolveForwardLinks === undefined) {
					flowConfig.resolveForwardLinks =
						previousConfig.resolveForwardLinks;
				}
				if (flowConfig?.resolveBacklinks === undefined) {
					flowConfig.resolveBacklinks =
						previousConfig.resolveBacklinks;
				}
			}

			let flowContent = await this.app.vault.read(flowFile);
			flowContent = flowContent
				.substring(flowConfig.frontMatterOffset)
				.trim();

			// This should happen only on the last step of the stack
			let input;
			let user_prompt;

			// If the flow is a prompt (.flow or .flowdata) , there is no input, and content is treated as the prompt
			if (inputConfig?.is_prompt) {
				user_prompt = joinStrings(flowConfig.userPrompt, flowContent);
			} else {
				user_prompt = flowConfig.userPrompt;
				input = inputConfig?.selectionInput
					? inputConfig?.selectionInput
					: flowContent;
			}

			input = input ? input : null;

			const user: User = {
				user_prompt,
				input,
				additional_context: {},
			};

			const exclusionPatterns: RegExp[] =
				this.parseExclusionPatterns(flowConfig?.exclusionPatterns) ||
				[];

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
					entity_recognition:
						previousPayload.options.entity_recognition,
					generate_embeddings:
						previousPayload.options.generate_embeddings,
					wikify: previousPayload.options.wikify,
				},
				provider: previousPayload.provider,
				llmOptions: {
					temperature:
						Number(flowConfig.llmOptions.temperature) ||
						previousPayload.llmOptions.temperature,
					max_tokens:
						Number(flowConfig.llmOptions.max_tokens) ||
						previousPayload.llmOptions.max_tokens,
				},
				requestId: previousPayload.requestId,
			};

			return { payload: data, config: flowConfig };
		} catch (e) {
			// This is potentially fine, if there is no flowdata file
			console.debug(e);
			return { payload: previousPayload, config: previousConfig };
		}
	};

	flowConfigFromPath = async (filePath: string): Promise<FlowConfig> => {
		const metadata = this.app.metadataCache.getFileCache(
			getFileByPath(filePath, this.app)
		);

		const llmOptions: LlmOptions = {};

		if (metadata?.frontmatter?.temperature) {
			llmOptions["temperature"] = metadata?.frontmatter?.temperature;
		}

		if (metadata?.frontmatter?.max_tokens) {
			llmOptions["max_tokens"] = metadata?.frontmatter?.max_tokens;
		}

		return {
			userPrompt: metadata?.frontmatter?.userPrompt,
			system_instructions: metadata?.frontmatter?.system_instructions,
			mode: metadata?.frontmatter?.mode,
			resolveBacklinks: metadata?.frontmatter?.resolveBacklinks,
			resolveForwardLinks: metadata?.frontmatter?.resolveForwardLinks,
			exclusionPatterns: metadata?.frontmatter?.exclusionPatterns || [],
			frontMatterOffset: metadata?.frontmatterPosition?.end?.offset || 0,
			llmOptions,
		};
	};

	parseExclusionPatterns = (patterns: string[]): RegExp[] => {
		return patterns.map((pattern) => new RegExp(pattern));
	};

	runFlow = async (editor: Editor, flow: string) => {
		const inputFlowFile = this.app.workspace.getActiveFile();

		if (!inputFlowFile) {
			return null;
		}

		const input = editor.getSelection();
		const fromSelection = Boolean(input);

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

		const payload = await this.collectInputsIntoPayload(
			input,
			inputFlowFile,
			flow
		);

		if (!payload) {
			throw new Error("Could not construct payload!");
		}

		const notice = new Notice(`Running ${flow} flow ...`, 0);
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
			getFileByPath(filePath, this.app)
		);
		return content;
	};

	readAndFilterContent = async (
		path: string,
		excludePatterns: RegExp[]
	): Promise<string | undefined> => {

    let adapter = this.app.vault.adapter;
    let basePath = null;
    if (adapter instanceof FileSystemAdapter) {
      basePath = adapter.getBasePath();
    }

    if (basePath == null) {
      throw new Error("Could not get vault base path");
    }

		if (excludePatterns.some((pattern) => pattern.test(path))) {
			return ""; // Skip reading if path matches any exclusion pattern
		}
		try {
			if (isImage(path)) {
				return await getImageContent(basePath, path);
			}
			if (isWord(path)) {
				return await getWordContents(basePath, path);
			}
			if (isOtherText(path)) {
				return getFileContents(basePath, path);
			}
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
		const file = getFileByPath(filePath, this.app);

		const activeBacklinks = getBacklinksForFile(file, this.app);
		// Process backlinks and resolved links
		const backlinkPromises = Array.from((await activeBacklinks).keys()).map(
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

	fetchResponse = async (requestId: string): Promise<ResponseRow[]> => {
		const response = await fetch(
			`https://${SUPABASE_URL}/rest/v1/atlas_responses?request_id=eq.${requestId}&select=response`,
			{
				headers: {
					apikey: SUPABASE_ANON_KEY,
					Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
					"Content-Type": "application/json",
					"x-api-key": this.settings.apiKey,
				},
				method: "GET",
			}
		);

		const respJson = await response.json();

		return respJson;
	};

	apiFetch = async (payload: Payload): Promise<string> => {
		if (
			this.settings.openAiSettings.apiKey &&
			this.settings.provider === "openai"
		) {
			const response = await openAiFetch(
				this.settings.openAiSettings.apiKey,
				this.settings.openAiSettings.modelId,
				payload,
				this.settings.llmOptions
			);
			return response || "";
		}

		if (
			this.settings.azureAiSettings.apiKey &&
			this.settings.provider === "azureai"
		) {
			const response = await azureAiFetch(
				this.settings.azureAiSettings.apiKey,
				this.settings.azureAiSettings.deploymentId,
				this.settings.azureAiSettings.endpoint,
				payload,
				this.settings.llmOptions
			);
			return response || "";
		}

		if (this.settings.provider === "cloudatlas" && this.settings.apiKey) {
			return await this.caApiFetch(payload);
		}

		new Notice("No LLM service selected, please chose one in settings");

		return "";
	};

	caApiFetch = async (payload: Payload): Promise<string> => {
		payload.version = "V2";
		console.debug(payload);
		let url = this.settings.previewMode
			? "https://dev-api.cloud-atlas.ai/run"
			: "https://api.cloud-atlas.ai/run";
		url = this.settings.developmentMode ? "http://localhost:8787/run" : url;
		const response = await fetch(url, {
			headers: {
				"x-api-key": this.settings.apiKey,
				"Content-Type": "application/json",
			},
			method: "POST",
			body: JSON.stringify(payload),
		});

		if (response.status != 200) {
			console.error(response);
			throw new Error("API request failed");
		} else {
			let respJsonS = await this.fetchResponse(payload.requestId);

			let count = 0;
			const interval = 5000;
			const timeoutMins = this.settings.timeoutMins;
			const timeout = timeoutMins * 60 * 1000;
			const timeoutCnt = timeout / interval;

			while (respJsonS.length == 0) {
				count++;
				console.debug(`Waiting for response... ${count}/${timeoutCnt}`);
				await sleep(interval);
				respJsonS = await this.fetchResponse(payload.requestId);
				if (count > timeoutCnt) {
					throw new Error("Timeout out waiting for results");
				}
			}

			return respJsonS[0].response;
		}
	};

	getNodeContent = async (node: Node): Promise<string | undefined> => {
		if (node.type == "text") {
			return this.getTextNodeContent(node as TextNode);
		} else if (node.type == "file") {
			return await this.getFileNodeContent(node as FileNode);
		}
	};

	getTextNodeContent = (node: TextNode) => {
		return node.text;
	};

	getFileNodeContent = async (
		node: FileNode
	): Promise<string | undefined> => {
		return await this.readAndFilterContent(node.file, []);
	};

	createFlow = async (flow: string) => {
		await this.create(
			`CloudAtlas/${flow}.flow.canvas`,
			JSON.stringify(CANVAS_CONTENT)
		);
	};

	createFolder = async (path: string) => {
		try {
			await this.app.vault.createFolder(path);
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

		const notice = new Notice(`Running Canvas flow ...`, 0);
		animateNotice(notice);

		try {
			const respJson = await this.apiFetch(data.payload);

			const refreshedData = await this.runCanvasFlow(noteFile);
			if (!refreshedData) {
				return;
			}
			const inputNodes = findInputNode(refreshedData.canvas.nodes);
			const canvasContent = refreshedData?.canvas;

			const responseNode = textNode(
				respJson,
				inputNodes[0].x + inputNodes[0].width + 100,
				inputNodes[0].y
			);

			canvasContent?.edges.push({
				id: randomUUID(),
				fromNode: inputNodes[0].id,
				fromSide: "right",
				toNode: responseNode.id,
				toSide: "left",
			});

			canvasContent?.nodes.push(responseNode);
			this.app.vault.modify(noteFile, JSON.stringify(canvasContent));
			console.debug("response: ", respJson);
		} catch (e) {
			console.error(e);
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
				const key = isFileNode(node)
					? (node as FileNode).file
					: node.id;
				additional_context[key] = content;
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
				options: {
					entity_recognition: this.settings.entityRecognition,
					generate_embeddings: this.settings.generateEmbeddings,
					wikify: this.settings.wikify,
				},
				provider: this.settings.useOpenAi ? "openai" : "azureai",
				llmOptions: {
					temperature: this.settings.llmOptions.temperature,
					max_tokens: this.settings.llmOptions.max_tokens,
				},
				requestId: new ShortUniqueId({ length: 10 }).rnd(),
			},
			canvas: canvasContent,
		};
	};

	private editorExtension: Extension[] = [];
	updateEditorExtension() {
		this.editorExtension.length = 0;
		const cloudAtlasExtension = this.createEditorExtension();
		this.editorExtension.push(cloudAtlasExtension);
		this.app.workspace.updateOptions();
	}

	createEditorExtension(): Extension {
		const app = this.app; // Reference to the app instance
		return ViewPlugin.fromClass(
			class {
				constructor(view: EditorView) {
					this.updateHeader(view, app);
				}

				update(update: ViewUpdate) {
					this.updateHeader(update.view, app);
				}

				updateHeader(view: EditorView, app: App) {
					const markdownView =
						app.workspace.getActiveViewOfType(MarkdownView);
					if (markdownView && markdownView.file) {
						const filePath = markdownView.file.path;

						if (filePath.endsWith(".flow.md")) {
							view.dom.classList.add("cloud-atlas-flow-file");
						} else if (filePath.endsWith(".flowdata.md")) {
							view.dom.classList.add("cloud-atlas-flowdata-file");
						} else {
							view.dom.classList.remove(
								"cloud-atlas-flow-file",
								"cloud-atlas-flowdata-file"
							);
						}
					}
				}
			}
		);
	}

	addFlowCommands = async () => {
		const vaultFiles = this.app.vault.getMarkdownFiles();

		console.debug(`Found ${vaultFiles.length} vault files`);

		const cloudAtlasFlows = vaultFiles.filter(
			(file) =>
				file.path.startsWith("CloudAtlas/") &&
				file.path.endsWith(".flow.md")
		);

		console.debug(`Found ${cloudAtlasFlows.length} CloudAtlas flows`);

		// Create commands for each flow
		cloudAtlasFlows.forEach((flowFile) => {
			const flow = flowFile.path.split("/")[1].split(".flow.md")[0];
			this.addNewCommand(this, flow);
		});
	};

	async onload() {
		console.debug("Entering onLoad");

		await this.loadSettings();
		console.debug("Loaded settings");

		try {
			this.registerEditorExtension(this.editorExtension);
			this.updateEditorExtension();
			this.app.workspace.onLayoutReady(() => {
				this.updateFlowCanvasClass(this.app.workspace.getActiveFile());
			});

			this.registerEvent(
				this.app.workspace.on("active-leaf-change", (leaf) => {
					const view =
						leaf?.view instanceof FileView ? leaf.view : null;
					const file = view ? view.file : null;
					if (file?.extension === "canvas") {
						this.updateFlowCanvasClass(file);
					}
				})
			);

			await this.createFolder("CloudAtlas");

			await this.create("CloudAtlas/example.flow.md", exampleFlowString);

			// await this.createFlow("Example");
			new Notice(
				"Created CloudAtlas folder with an example flow. Please configure the plugin to use it."
			);
		} catch (e) {
			console.debug("Could not create folder, it likely already exists");
		}
		console.debug("Bootstraped CloudAtlas folder");

		await sleep(100);
		this.addFlowCommands();

		this.addCommand({
			id: `create-flow`,
			name: `Create new flow`,
			callback: async () => {
				const name = randomName();
				this.app.vault.create(
					`CloudAtlas/${name}.flow.md`,
					exampleFlowString
				);
				this.app.vault.create(`CloudAtlas/${name}.flowdata.md`, "");
			},
		});

		this.addCommand({
			id: "refresh",
			name: "Refresh",
			callback: async () => {
				this.addFlowCommands();
				new Notice("Refreshed Cloud Atlas flows");
			},
		});

		this.addCommand({
			id: `run-canvas-flow`,
			name: `Run Canvas Flow`,
			checkCallback: (checking: boolean) => {
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

		this.addSettingTab(new CloudAtlasGlobalSettingsTab(this.app, this));
	}

	updateFlowCanvasClass(file: TFile | null) {
		const leafType = this.app.workspace
			.getActiveViewOfType(ItemView)
			?.getViewType();
		activeDocument.body.classList.remove("cloud-atlas-flow-canvas");
		if (
			file &&
			file.extension === "canvas" &&
			leafType === "canvas" &&
			file.name.endsWith(".flow.canvas")
		) {
			activeDocument.body.addClass("cloud-atlas-flow-canvas");
		}
	}

	private addNewCommand(plugin: CloudAtlasPlugin, flow: string): void {
		console.debug("Adding command for flow: ", flow);
		this.addCommand({
			id: `run-flow-${flow}`,
			name: `Run ${flow} Flow`,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.runFlow(editor, flow);
			},
		});

		this.addCommand({
			id: `compile-flow-${flow}`,
			name: `Compile ${flow} Flow`,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const input = editor.getSelection();
				const inputFlowFile = this.app.workspace.getActiveFile();

				if (!inputFlowFile) {
					return null;
				}
				const payload = await this.collectInputsIntoPayload(
					input,
					inputFlowFile,
					flow
				);

				if (!payload) {
					throw new Error("Could not construct payload!");
				}

				const canvasContent = payloadToGraph(payload);

				const canvasFilePath = `CloudAtlas/${flow}.flow.canvas`;
				const canvasFile = await getFileByPath(
					canvasFilePath, this.app
				);

				if (!canvasFile) {
					this.app.vault.create(
						`CloudAtlas/${flow}.flow.canvas`,
						JSON.stringify(canvasContent)
					);
				} else {
					this.app.vault.modify(
						canvasFile as TFile,
						JSON.stringify(canvasContent)
					);
				}
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
