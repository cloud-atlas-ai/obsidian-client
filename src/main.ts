import {
	App,
	Editor,
	FileSystemAdapter,
	FileView,
	ItemView,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
	normalizePath,
} from "obsidian";
import {
	CanvasContent,
	FileNode,
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
	AutoProcessingConfig,
	CaRequestMsg,
} from "./interfaces";
import { v4 as uuidv4 } from "uuid";
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
	isFlow,
	isCanvasFlow,
	insertPayload,
	extractLinksFromContent,
	fetchUrlContent,
} from "./utils";
import {
	CloudAtlasGlobalSettingsTab,
	CloudAtlasPluginSettings,
} from "./settings";
import {
	ADDITIONAL_SYSTEM,
	CANVAS_CONTENT,
	DEFAULT_SETTINGS,
	PLACEHOLDER,
	SUPABASE_ANON_KEY,
	SUPABASE_URL,
	exampleFlowString,
} from "./constants";
import { Extension } from "@codemirror/state";
import { randomName } from "./namegenerator";
import { azureAiFetch, openAiFetch } from "./byollm";
import { FlowView, CA_VIEW_TYPE } from "./flow_view";
import { INTERACTIVE_PANEL_TYPE, InteractivePanel } from "./interactive_panel";

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

	getFlowFilePath = (flow: string) => {
		return normalizePath(`CloudAtlas/${flow}.flow.md`);
	};

	getCapabilityFlowFilePath = (flow: string) => {
		return normalizePath(`CloudAtlas/capabilities/${flow}.flow.md`);
	};

	getFlowdataFilePath = (flow: string) => {
		return normalizePath(`CloudAtlas/${flow}.flowdata.md`);
	};

	collectInputsIntoPayload = async (
		input: string | null,
		inputFlowFile: TFile,
		flow: string,
		isCapability: boolean = false
	): Promise<PayloadConfig | null> => {
		let templateFlowFilePath;
		if (isCapability) {
			templateFlowFilePath = this.getCapabilityFlowFilePath(flow);
		} else {
			templateFlowFilePath = this.getFlowFilePath(flow);
		}
		const dataFlowFilePath = this.getFlowdataFilePath(flow);

		const flows = [
			templateFlowFilePath,
			dataFlowFilePath,
			inputFlowFile.path,
		];

		const payloadConfig = await this.combineFlows(flows, input);

		return payloadConfig;
	};

	combineFlows = async (
		paths: string[],
		input: string | null
	): Promise<PayloadConfig | null> => {
		const uniquePaths = [...new Set(paths)];
		const user = { input, user_prompt: null };
		const caRequestMsg: CaRequestMsg = {
			user,
			system: null,
			assistant: null,
		};
		const payloadConfig: PayloadConfig = {
			payload: {
				messages: [caRequestMsg],
				options: {
					generate_embeddings: this.settings.generateEmbeddings,
					entity_recognition: this.settings.entityRecognition,
					wikify: this.settings.wikify,
				},
				provider: this.settings.useOpenAi
					? "openai"
					: this.settings.useVertexAi
					? "vertexai"
					: "azureai",
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
				expandUrls: true,
				exclusionPatterns: [],
				frontMatterOffset: 0,
				llmOptions: {
					temperature: this.settings.llmOptions.temperature,
					max_tokens: this.settings.llmOptions.max_tokens,
				},
				additional_context: {},
				model: null,
				can_delegate: false,
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

		return payloadConfig;
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
				if (flowConfig?.expandUrls === undefined) {
					flowConfig.expandUrls = previousConfig.expandUrls;
				}
				// Inherit model if not defined
				if (flowConfig?.model === undefined) {
					flowConfig.model = previousConfig.model;
				}
				if (flowConfig?.can_delegate === undefined) {
					flowConfig.can_delegate = previousConfig.can_delegate;
				}
			}

			let flowContent = await this.app.vault.read(flowFile);
			flowContent = flowContent
				.substring(flowConfig.frontMatterOffset)
				.trim();

			// Check if the flow content contains the capabilities shortcut and expand it in memory
			if (flowContent.includes("{{ca-capabilities}}")) {
				console.debug(
					"Found capabilities shortcut in flow, expanding in memory"
				);
				const capabilitiesList = await this.getCapabilitiesList();
				flowContent = flowContent.replace(
					"{{ca-capabilities}}",
					capabilitiesList
				);
			}

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

			const additionalContext = flowConfig.additional_context || {};

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

			if (flowConfig.expandUrls) {
				const urls = extractLinksFromContent(flowContent);
				for (const url of urls) {
					const content = await fetchUrlContent(url);
					if (content) {
						additionalContext[url] = content;
					}
				}
			}

			user.additional_context = additionalContext;

			const caRequestMsg: CaRequestMsg = {
				user,
				assistant: null,
				system: flowConfig.system_instructions,
			};
			const data = {
				messages: [caRequestMsg],
				options: {
					entity_recognition:
						previousPayload.options.entity_recognition,
					generate_embeddings:
						previousPayload.options.generate_embeddings,
					wikify: previousPayload.options.wikify,
				},
				// Use the model to set the provider if available
				provider: flowConfig.model || previousPayload.provider,
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

		const additionalContext: AdditionalContext = {};

		if (metadata?.frontmatter) {
			const frontmatter = metadata?.frontmatter;
			const links = frontmatter["ca-url"]; //handle ca-url being undefined
			links &&
				links.map((link: string) => {
					additionalContext[link] = link;
				});

			console.debug(additionalContext);
		}

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
			expandUrls: metadata?.frontmatter?.expandUrls,
			exclusionPatterns: metadata?.frontmatter?.exclusionPatterns || [],
			frontMatterOffset: metadata?.frontmatterPosition?.end?.offset || 0,
			llmOptions,
			additional_context: additionalContext,
			model: metadata?.frontmatter?.model,
			can_delegate: metadata?.frontmatter?.can_delegate,
		};
	};

	parseExclusionPatterns = (patterns: string[]): RegExp[] => {
		return patterns.map((pattern) => new RegExp(pattern));
	};

	flowToResponse = async (
		path: TFile,
		flow: string,
		isCapability: boolean = false
	): Promise<string> => {
		const payloadConfig = await this.collectInputsIntoPayload(
			null,
			path,
			flow
		);

		if (!payloadConfig?.payload) {
			throw new Error("Could not construct payload!");
		}

		let respJson = await this.apiFetch(payloadConfig.payload);

		console.log(payloadConfig.config);

		if (payloadConfig.config.can_delegate) {
			// Save the response to a temporary file for debugging or reference
			const flows: string[] = JSON.parse(respJson);
			for (let i = 0; i < flows.length; i++) {
				const flow = flows[i];
				if (i === 0) {
					// this is the first post delegation flow, it needs to run on the original file
					respJson = await this.flowToResponse(path, flow);
				} else {
					try {
						const tempFilePath = `CloudAtlas/temp/${payloadConfig.payload.requestId}_response.json`;
						await this.createFolder("CloudAtlas/temp");
						await this.app.vault.create(tempFilePath, respJson);
						console.log(`Saved response to ${tempFilePath}`);
						respJson = await this.flowToResponse(
							await getFileByPath(tempFilePath, this.app),
							flow,
							true
						);
					} catch (error) {
						console.error(
							"Failed to save response to temp file:",
							error
						);
					}
				}
			}
		}

		return respJson;
	};

	deployFlow = async (flow: string): Promise<string> => {
		await this.uploadFlow(flow);
		const apiUrl = this.apiUrl();
		const response = await fetch(`${apiUrl}/deploy`, {
			headers: {
				"x-api-key": this.settings.apiKey,
				"Content-Type": "application/json",
			},
			method: "POST",
			body: JSON.stringify({ flow }),
		});

		const project_url = await response.text();

		await this.createFolder("CloudAtlas/deploy-info");

		await this.app.vault.create(
			`CloudAtlas/deploy-info/${flow}.flowdeploy.md`,
			JSON.stringify({
				project_url,
			})
		);

		return project_url;
	};

	uploadFlow = async (flow: string) => {
		const templateFlowFilePath = this.getFlowFilePath(flow);
		const dataFlowFilePath = this.getFlowdataFilePath(flow);

		const flows = [templateFlowFilePath, dataFlowFilePath].filter(Boolean);

		const payloadConfig = await this.combineFlows(flows, null);

		console.log(payloadConfig);

		if (payloadConfig?.payload) {
			const flowResponse = await insertPayload(
				this.settings.apiKey,
				flow,
				payloadConfig.payload
			);

			console.debug("Payload insert: ", flowResponse.status);
		}
	};

	runFlow = async (editor: Editor | null, flow: string) => {
		console.log("Running flow: ", flow);
		const inputFlowFile = this.app.workspace.getActiveFile();

		if (!inputFlowFile) {
			console.debug("No active file");
			new Notice("No active file in the editor, open one and try again.");
			return null;
		}

		const input = editor?.getSelection();
		const fromSelection = Boolean(input);

		if (editor) {
			if (fromSelection) {
				editor.replaceSelection(
					input + "\n\n---\n\n" + PLACEHOLDER + "\n\n---\n"
				);
			} else {
				// Create the placeholder content to be inserted
				const curCursor = editor.getCursor();
				const placeholderContent =
					"\n---\n\n" + PLACEHOLDER + "\n\n---\n";

				// Insert the placeholder content at the cursor position
				editor.replaceRange(placeholderContent, curCursor);
			}
		} else {
			const current = await this.app.vault.read(inputFlowFile);
			const output = current + "\n---\n" + PLACEHOLDER + "\n\n---\n";
			await this.app.vault.modify(inputFlowFile, output);
		}

		const notice = new Notice(`Running ${flow} flow ...`, 0);
		animateNotice(notice);

		try {
			const respJson = await this.flowToResponse(inputFlowFile, flow);
			const currentNoteContents = await this.app.vault.read(
				inputFlowFile
			);
			const output = currentNoteContents.replace(PLACEHOLDER, respJson);

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
	): Promise<string | null> => {
		if (excludePatterns.some((pattern) => pattern.test(path))) {
			return ""; // Skip reading if path matches any exclusion pattern
		}
		try {
			if (isFlow(path)) {
				// naming structure of the .flowrun file should be <name>.<flow-name>.flowrun.md
				// Example: monday-meeting.summarize call.flowrun.md
				// TODO: This is a bit brittle, use and iterate
				const flowrunPat = path.split(".");
				const flowName = flowrunPat[flowrunPat.length - 3];
				console.log(flowName);
				return await this.flowToResponse(
					getFileByPath(path, this.app),
					flowName
				);
			}
			if (isCanvasFlow(path)) {
				return await this.canvasOps(getFileByPath(path, this.app));
			}
			if (isImage(path)) {
				return await getImageContent(path);
			}
			if (isWord(path)) {
				const adapter = this.app.vault.adapter;
				let basePath = null;
				if (adapter instanceof FileSystemAdapter) {
					basePath = adapter.getBasePath();
				}
				if (basePath == null) {
					throw new Error("Could not get vault base path");
				}
				return await getWordContents(basePath, path);
			}
			if (isOtherText(path)) {
				return getFileContents(path);
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
			async (path) => {
				const linkedNoteContent = await this.readAndFilterContent(
					path,
					excludePatterns
				);
				if (linkedNoteContent) {
					additionalContext[path] = linkedNoteContent;
				}
				const metadata = this.app.metadataCache.getFileCache(
					getFileByPath(path, this.app)
				);
				if (metadata?.frontmatter?.recurseLinks) {
					console.debug("Recursing links for: ", path);
					const resolvedLinks = await this.resolveLinksForPath(
						path,
						excludePatterns
					);
					Object.assign(additionalContext, resolvedLinks);
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

	executeCanvasFlow = async (
		payload: Payload,
		noteFile: TFile
	): Promise<string | null> => {
		const respJson = await this.apiFetch(payload);

		const canvas = await this.getCanvasContent(noteFile);
		if (!canvas) {
			return null;
		}
		const inputNodes = findInputNode(canvas.nodes);
		const canvasContent = canvas;

		const responseNode = textNode(
			respJson,
			inputNodes[0].x + inputNodes[0].width + 100,
			inputNodes[0].y
		);

		canvasContent?.edges.push({
			id: uuidv4(),
			fromNode: inputNodes[0].id,
			fromSide: "right",
			toNode: responseNode.id,
			toSide: "left",
		});

		canvasContent?.nodes.push(responseNode);
		this.app.vault.modify(noteFile, JSON.stringify(canvasContent));
		// console.debug("response: ", respJson);
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

	apiUrl = () => {
		const url = this.settings.previewMode
			? "https://dev-api.cloud-atlas.ai"
			: "https://api.cloud-atlas.ai";
		return this.settings.developmentMode ? "http://localhost:8787" : url;
	};

	caApiFetch = async (payload: Payload): Promise<string> => {
		payload.version = "V2";
		console.debug(payload);
		const url = `${this.apiUrl()}/run`;
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

			// console.log("respJsonS: ", respJsonS);

			return respJsonS[0].response;
		}
	};

	getNodeContent = async (node: Node): Promise<string | null> => {
		console.log("Getting node content: ", node);
		if (node.type == "text") {
			return this.getTextNodeContent(node as TextNode);
		} else if (node.type == "file") {
			return await this.getFileNodeContent(node as FileNode);
		}
		return null;
	};

	getTextNodeContent = (node: TextNode) => {
		return node.text;
	};

	getFileNodeContent = async (node: FileNode): Promise<string | null> => {
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

	canvasOps = async (noteFile: TFile): Promise<string | null> => {
		const data = await this.runCanvasFlow(noteFile);
		if (!data) {
			return null;
		}

		const batch = Object.keys(
			data.payload.messages[0].user?.additional_context as object
		).filter((key) => key.endsWith(".index.md"));
		const payloadsQueue = [];
		if (batch.length == 1) {
			const batchIndex = batch[0];
			const items = await this.resolveLinksForPath(batchIndex, []);
			// loop over items
			for (const [key, value] of Object.entries(items)) {
				const payload = JSON.parse(JSON.stringify(data.payload));

				payload.user.additional_context[key] = value;
				payload.requestId = new ShortUniqueId({ length: 10 }).rnd();
				delete payload.user.additional_context[batchIndex];
				payloadsQueue.push(payload);
			}
		}

		if (payloadsQueue.length == 0) {
			payloadsQueue.push(data.payload);
		}

		const notice = new Notice(`Running Canvas flow ...`, 0);
		animateNotice(notice);

		const responses: string[] = [];

		while (payloadsQueue.length) {
			const payloadsChunk = payloadsQueue.splice(0, 3);
			const inFlight = payloadsChunk.map(async (payload) => {
				try {
					// This has a side effect of modifying the canvas file
					const response = await this.executeCanvasFlow(
						payload,
						noteFile
					);
					if (response) {
						responses.push(response);
					}
					responses.push();
				} catch (e) {
					console.error(e);
					notice.hide();
					new Notice("Something went wrong. Check the console.");
				}
			});
			await Promise.all(inFlight);
		}

		notice.hide();
		clearTimeout(noticeTimeout);
		// console.debug(responses);
		return responses.join("\n");
	};

	getCanvasContent = async (canvasFile: TFile) => {
		const canvasContentString = await this.app.vault.read(canvasFile);
		const canvasContent: CanvasContent = JSON.parse(canvasContentString);
		return canvasContent;
	};

	runCanvasFlow = async (
		canvasFile: TFile
	): Promise<CanvasScaffolding | undefined> => {
		const canvasContent: CanvasContent = await this.getCanvasContent(
			canvasFile
		);
		const inputNodes = findInputNode(canvasContent.nodes);
		if (!inputNodes) {
			new Notice("Could not find Input(Red) node.");
			return;
		} else if (inputNodes.length > 1) {
			new Notice("Found multiple Input(Red) nodes, only one is allowed.");
			return;
		}
		const inputNode = inputNodes[0];
		const input = await this.getNodeContent(inputNode);
		const user_prompt = [];
		for (const node of filterNodesByType(
			NodeType.UserPrompt,
			canvasContent.nodes
		)) {
			const content = await this.getNodeContent(node);
			if (content) {
				user_prompt.push(content);
			}
		}
		const system_instructions = [];
		for (const node of filterNodesByType(
			NodeType.System,
			canvasContent.nodes
		)) {
			const content = await this.getNodeContent(node);
			if (content) {
				system_instructions.push(content);
			}
		}
		system_instructions.push(ADDITIONAL_SYSTEM);
		const additional_context: AdditionalContext = {};
		const promises = filterNodesByType(
			NodeType.Context,
			canvasContent.nodes
		).map(async (node) => {
			const content = await this.getNodeContent(node);
			if (content) {
				const key = isFileNode(node)
					? (node as FileNode).file
					: node.id;
				additional_context[key] = content;
			}
			if (isFileNode(node)) {
				const metadata = this.app.metadataCache.getFileCache(
					getFileByPath((node as FileNode).file, this.app)
				);
				if (metadata?.frontmatter?.recurseLinks) {
					console.debug(
						"Recursing links for: ",
						(node as FileNode).file
					);
					const resolvedLinks = await this.resolveLinksForPath(
						(node as FileNode).file,
						[]
					);
					Object.assign(additional_context, resolvedLinks);
				}
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

		const caRequestMsg: CaRequestMsg = {
			user,
			system: system_instructions.join("\n"),
			assistant: null,
		};

		return {
			payload: {
				messages: [caRequestMsg],
				options: {
					entity_recognition: this.settings.entityRecognition,
					generate_embeddings: this.settings.generateEmbeddings,
					wikify: this.settings.wikify,
				},
				provider: this.settings.autoModel
					? "auto"
					: this.settings.useOpenAi
					? "openai"
					: this.settings.useVertexAi
					? "vertexai"
					: "azureai",
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
						} else if (filePath.endsWith(".flowrun.md")) {
							view.dom.classList.add("cloud-atlas-flowrun-file");
						} else if (filePath.endsWith(".flowdeploy.md")) {
							view.dom.classList.add(
								"cloud-atlas-flowdeploy-file"
							);
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

	addFlowCommands = () => {
		// Create commands for each flow registered in the settings

		console.debug("Registered flows: ", this.settings.registeredFlows);

		this.settings.registeredFlows.forEach((flow) => {
			this.addNewCommand(this, flow);
		});
	};

	async activateView(open: boolean) {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(CA_VIEW_TYPE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
			if (open) {
				workspace.revealLeaf(leaf);
			}
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: CA_VIEW_TYPE, active: true });
		}
	}

	async activateInteractivePanel(open: boolean) {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(INTERACTIVE_PANEL_TYPE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
			if (open) {
				workspace.revealLeaf(leaf);
			}
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({
				type: INTERACTIVE_PANEL_TYPE,
				active: true,
			});
		}
	}

	async onload() {
		console.debug("Entering onLoad");

		this.addRibbonIcon("workflow", "Cloud Atlas flows", () => {
			try {
				this.activateView(true);
			} catch (e) {
				console.debug(e);
			}
		});

		this.addRibbonIcon("cloud-cog", "Cloud Atlas panel", () => {
			try {
				this.activateInteractivePanel(true);
			} catch (e) {
				console.debug(e);
			}
		});

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
			new Notice(
				"Created CloudAtlas folder with an example flow. Please configure the plugin to use it."
			);
		} catch (e) {
			console.debug("Could not create folder, it likely already exists");
		}

		try {
			// Create the capabilities folder if it doesn't exist
			await this.createFolder("CloudAtlas/capabilities");
		} catch (e) {
			console.debug(
				"Could not create capabilities folder, it likely already exists"
			);
		}

		console.debug("Bootstraped CloudAtlas folder");

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
			id: `create-capability-flow`,
			name: `Create new capability flow`,
			callback: async () => {
				// Create capabilities folder if it doesn't exist
				await this.createFolder("CloudAtlas/capabilities");

				// Generate a random name for the flow
				const name = randomName();

				// Create the flow file
				await this.app.vault.create(
					`CloudAtlas/capabilities/${name}.flow.md`,
					exampleFlowString
				);

				// Show a notice
				new Notice(`Created capability flow: ${name}`);
			},
		});

		this.addFlowCommands();
		this.activateView(false);

		this.addCommand({
			id: `run-canvas-flow`,
			name: `Run Canvas flow`,
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

		this.addCommand({
			id: "setup-auto-processing",
			name: "Setup Auto-Processing in Current Folder",
			checkCallback: (checking: boolean) => {
				// Get current folder
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return false;

				// Get folder path
				const folderPath = activeFile.parent?.path;
				if (!folderPath) return false;

				if (!checking) {
					this.setupAutoProcessing(folderPath);
				}
				return true;
			},
		});

		this.registerView(CA_VIEW_TYPE, (leaf) => new FlowView(leaf, this));
		this.registerView(
			INTERACTIVE_PANEL_TYPE,
			(leaf) => new InteractivePanel(leaf, this)
		);
		this.addSettingTab(new CloudAtlasGlobalSettingsTab(this.app, this));

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				console.log("Creating file:", file.path);
				if (!(file instanceof TFile)) return;

				// Process any new file (not just those in "sources" folders)
				this.processNewFile(file);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				console.log("Moving/renaming file:", oldPath, "to", file.path);
				if (!(file instanceof TFile)) return;

				// Process the file if it's moved to a new location
				this.processNewFile(file);
			})
		);
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
			name: `Run ${flow} flow`,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.runFlow(editor, flow);
			},
		});

		this.addCommand({
			id: `compile-flow-${flow}`,
			name: `Compile ${flow} flow`,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const input = editor.getSelection();
				const inputFlowFile = this.app.workspace.getActiveFile();

				if (!inputFlowFile) {
					return null;
				}
				const payloadConfig = await this.collectInputsIntoPayload(
					input,
					inputFlowFile,
					flow
				);

				if (!payloadConfig?.payload) {
					throw new Error("Could not construct payload!");
				}

				const canvasContent = payloadToGraph(payloadConfig.payload);

				const canvasFilePath = `CloudAtlas/${flow}.flow.canvas`;
				const canvasFile = await getFileByPath(
					canvasFilePath,
					this.app
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

	async processNewFile(file: TFile) {
		// Skip processing if auto-processing is disabled globally
		if (!this.settings.autoProcessing.enabled) return;

		// Skip processing configuration files themselves
		if (file.basename === "_cloudatlas") return;

		// Get the folder path
		const folderPath = file.parent?.path || "";

		// Look for configuration in the folder
		const config = await this.getAutoProcessingConfig(folderPath);
		if (!config || !config.enabled) return;

		// Show processing notice
		const notice = new Notice(
			`Processing ${file.basename} with ${config.flow} flow...`,
			0
		);
		animateNotice(notice);

		try {
			// Process file with the specified flow
			console.log(`Processing with flow: ${config.flow}`);
			const result = await this.flowToResponse(file, config.flow);

			// Add source file link to the result
			const sourceLink = `\n\n---\nSource: [[${file.path}|${file.basename}]]`;
			const resultWithSourceLink = result + sourceLink;

			// Generate and save output file
			const outputFilename = this.generateOutputFilename(
				file,
				config.outputNameTemplate
			);
			const outputPath = `${folderPath}/${outputFilename}`;
			try {
				const existingFile = getFileByPath(outputPath, this.app);
				if (existingFile) {
					await this.app.vault.modify(
						existingFile,
						resultWithSourceLink
					);
				} else {
					await this.app.vault.create(
						outputPath,
						resultWithSourceLink
					);
				}
			} catch (e) {
				await this.app.vault.create(outputPath, resultWithSourceLink);
			}

			// Success notice
			notice.hide();
			clearTimeout(noticeTimeout);
			new Notice(`Processing complete: ${outputFilename}`);
		} catch (e) {
			// Error handling
			notice.hide();
			clearTimeout(noticeTimeout);
			console.error("Auto-processing failed:", e);
			new Notice(
				`Failed to process ${file.basename}. See console for details.`
			);
		}
	}

	async getAutoProcessingConfig(
		folderPath: string
	): Promise<AutoProcessingConfig | null> {
		// Try _cloudatlas.md first, then fall back to _autoprocess.md
		const configPaths = [`${folderPath}/_cloudatlas.md`];

		for (const configPath of configPaths) {
			try {
				const configFile = getFileByPath(configPath, this.app);
				if (!configFile) continue;

				const metadata =
					this.app.metadataCache.getFileCache(configFile);

				if (metadata?.frontmatter) {
					return {
						enabled: metadata.frontmatter.enabled ?? true,
						flow:
							metadata.frontmatter.flow ??
							this.settings.autoProcessing.defaultFlow,
						outputNameTemplate:
							metadata.frontmatter.outputNameTemplate ??
							"${basename}-processed",
						expandUrls: metadata.frontmatter.expandUrls ?? false,
					};
				}
			} catch (e) {
				// Config file doesn't exist or can't be read
				continue;
			}
		}

		return null;
	}

	generateOutputFilename(file: TFile, template: string): string {
		const basename = file.basename;
		return template.replace("${basename}", basename) + ".md";
	}

	async setupAutoProcessing(folderPath: string) {
		// Create configuration file
		const configContent = `---
enabled: true
flow: ${this.settings.autoProcessing.defaultFlow || "example"}
outputNameTemplate: \${basename}-processed
---

# CloudAtlas Auto-Processing Configuration

This file configures automatic processing for files added to this folder.

- **enabled**: Set to true to enable auto-processing, false to disable
- **flow**: The flow to use for processing
- **outputNameTemplate**: Template for naming output files. \${basename} will be replaced with the input file name
`;

		const configPath = `${folderPath}/_cloudatlas.md`;
		try {
			await this.app.vault.create(configPath, configContent);
			new Notice(`Auto-processing setup complete in ${folderPath}`);
		} catch (e) {
			console.error("Failed to create auto-processing config:", e);
			new Notice(
				"Failed to setup auto-processing. See console for details."
			);
		}
	}

	/**
	 * Lists all .flow files in the capabilities folder and formats them as a markdown list
	 */
	async getCapabilitiesList(): Promise<string> {
		try {
			// Get all files in the vault
			const vaultFiles = this.app.vault.getMarkdownFiles();

			// Filter for .flow.md files in the capabilities folder
			const capabilityFlows = vaultFiles
				.filter(
					(file) =>
						file.path.startsWith("CloudAtlas/capabilities/") &&
						file.path.endsWith(".flow.md")
				)
				.map((f) => {
					// Extract flow name from path
					const flowName =
						f.path.split("/").pop()?.split(".flow.md")[0] || "";
					return flowName;
				})
				.sort();

			// Format as a markdown list
			if (capabilityFlows.length === 0) {
				return "No capability flows found in CloudAtlas/capabilities folder.";
			}

			let result = "**Available Capabilities:**\n\n";
			capabilityFlows.forEach((flow) => {
				result += `- ${flow}\n`;
			});

			return result;
		} catch (e) {
			console.error("Error getting capabilities list:", e);
			return "Error listing capabilities.";
		}
	}
}
