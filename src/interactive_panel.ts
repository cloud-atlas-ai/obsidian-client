import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import CloudAtlasPlugin from "./main";

import { Payload } from "./interfaces";
import ShortUniqueId from "short-unique-id";
import { extractLinksFromContent, fetchUrlContent } from "./utils";

export const INTERACTIVE_PANEL_TYPE = "interactive-panel";

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

export class InteractivePanel extends ItemView {
	plugin: CloudAtlasPlugin;
	attachedFiles: Set<string>;
	attachedFilesListEl: HTMLElement;
	settings: import("./settings").CloudAtlasPluginSettings;
	responseContainer: HTMLDivElement;
	responsePre: HTMLPreElement;
	responseCode: HTMLElement;
	loadingIndicator: HTMLDivElement;
	copyButton: HTMLButtonElement;

	constructor(leaf: WorkspaceLeaf, plugin: CloudAtlasPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.settings = this.plugin.settings;
		this.attachedFiles = new Set(); // Initialize the Set
		// attachedFilesListEl will be set in onOpen
	}

	setLoading(loading: boolean) {
		if (loading) {
			this.loadingIndicator.style.display = "block";
		} else {
			this.loadingIndicator.style.display = "none";
		}
	}

	getViewType() {
		return INTERACTIVE_PANEL_TYPE;
	}

	getIcon(): string {
		return "cloud-cog";
	}

	getDisplayText() {
		return "Cloud Atlas Interactive Mode";
	}

	createUserPromptTextbox() {
		// Implement the logic for creating the user prompt textbox here.
		const promptTextbox = document.createElement("textarea");
		promptTextbox.placeholder = "Enter your prompt here...";
		promptTextbox.classList.add("ca-interactive-prompt-textbox");
		this.containerEl.appendChild(promptTextbox);
		return promptTextbox;
	}

	createAttachedFilesList() {
		const attachedFilesList = this.containerEl.createDiv({
			cls: "attached-notes-list",
		});
		const listHeader = attachedFilesList.createEl("h4", {
			text: "Attached Notes",
		});
		listHeader.style.marginBottom = "1em";
		const filesList = attachedFilesList.createEl("ul");
		filesList.style.height = "200px"; // Set a fixed height
		filesList.style.overflowY = "auto"; // Make it scrollable
		return filesList;
	}

	// Function to update the attached files list
	updateAttachedFilesList(filesList: HTMLElement) {
		filesList.empty();
		if (this.attachedFiles.size === 0) {
			filesList.createEl("li", { text: "No notes attached." });
		} else {
			this.attachedFiles.forEach((file) => {
				const listItem = filesList.createEl("li", { text: file });
				const removeButton = listItem.createEl("button", {
					text: "Remove",
					cls: "cloud-atlas-flow-btn-primary",
				});
				setIcon(removeButton, "trash-2");
				removeButton.onClickEvent(() => {
					this.attachedFiles.delete(file);
					this.updateAttachedFilesList(filesList);
				});
			});
		}
	}

	// Updated onOpen method
	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h4", { text: "Cloud Atlas Interactive Mode" });

		// Create the user prompt text box
		const prompt = this.createUserPromptTextbox();
		container.appendChild(prompt);

		// Display a tip message for submitting using Ctrl+Enter
		const tip = container.createEl("p", { text: "Ctrl+Enter to submit" });
		tip.addClass("submit-tip");
		tip.style.fontSize = "0.8em";
		tip.style.color = "var(--text-muted)";
		tip.style.marginTop = "4px";

		// Create a container to hold the inline action buttons
		const actionButtonContainer = container.createDiv();
		actionButtonContainer.style.display = "flex";
		actionButtonContainer.style.alignItems = "center";
		actionButtonContainer.style.gap = "8px";

		// Inline Attach button (using style from flows view)
		const attachButton = actionButtonContainer.createEl("button", {
			cls: "ca-attach-note-button cloud-atlas-flow-btn-primary",
			text: "+",
		});

		// Make the attach button square and larger
		setIcon(attachButton, "file-plus");
		// Click listener for attaching the current note
		attachButton.addEventListener("click", () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				console.debug("Attaching file: ", activeFile.path);
				this.attachedFiles.add(activeFile.path);
				new Notice(`Attached file: ${activeFile.path}`);
				// Update our stored attached files list element
				this.updateAttachedFilesList(this.attachedFilesListEl);
			} else {
				new Notice("No file is currently open.");
			}
		});

		// Inline Send button (using style from flows view)
		const sendButton = actionButtonContainer.createEl("button", {
			cls: "send-button cloud-atlas-flow-btn-primary",
			text: "Send to LLM",
		});

		setIcon(sendButton, "play");
		// Make the send button square and larger so the text fits

		sendButton.addEventListener("click", async () => {
			if (prompt.value.trim() === "") {
				new Notice("Please enter a prompt before sending.");
				return;
			}
			await this.handleSendClick(prompt.value);
		});

		// Keydown listener for Ctrl+Enter to submit the prompt
		prompt.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.ctrlKey && event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				sendButton.click();
			}
		});

		// Create and store the attached files list (UL element)
		this.attachedFilesListEl = this.createAttachedFilesList();
		this.updateAttachedFilesList(this.attachedFilesListEl);

		// Response header and Copy button setup
		const responseHeader = container.createEl("h4", { text: "Response" });
		this.copyButton = container.createEl("button", {
			text: "Copy to Clipboard",
			cls: "ca-a-interactive-copy-button",
		});
		this.copyButton.hide();
		responseHeader.insertAdjacentElement("afterend", this.copyButton);

		this.copyButton.onClickEvent(() => {
			if (this.responseCode) {
				navigator.clipboard.writeText(this.responseCode.innerText).then(
					() => {
						new Notice("Response copied to clipboard.");
					},
					(err) => {
						console.error("Could not copy text: ", err);
						new Notice("Failed to copy response to clipboard.");
					}
				);
			}
		});

		// Response container setup
		this.responseContainer = container.createDiv({
			cls: "response-container",
		});
		this.responsePre = this.responseContainer.createEl("pre", {
			cls: "ca-scrollable-response",
		});
		this.responseCode = this.responsePre.createEl("code");
		this.responseCode.addClass("ca-response-code");

		// Loading indicator setup
		this.loadingIndicator = container.createDiv({
			cls: "loading-indicator",
		});
		setIcon(this.loadingIndicator, "sync");
		this.loadingIndicator.setText(" Waiting for response");
		this.setLoading(false);
	}

	private async handleSendClick(promptValue: string) {
		// Build the payload using the promptValue and attached files
		const payload: Payload = {
			user: {
				user_prompt: promptValue,
				input: "See Additional Context and Respond to Prompt",
				additional_context: {},
			},
			system: null,
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
		};

		// Add contents from attached files to the payload's additional context
		if (!payload.user.additional_context) {
			payload.user.additional_context = {};
		}

		// Process attached files
		for (const filePath of this.attachedFiles) {
			const fileContent = await this.plugin.readAndFilterContent(
				filePath,
				[]
			);
			if (fileContent !== null) {
				payload.user.additional_context[filePath] = fileContent;

				// Expand URLs in attached files if enabled
				if (this.settings.interactivePanel.expandUrls) {
					const urls = extractLinksFromContent(fileContent);
					for (const url of urls) {
						const content = await fetchUrlContent(url);
						if (content) {
							payload.user.additional_context[url] = content;
						}
					}
				}

				// Resolve links if enabled
				if (this.settings.interactivePanel.resolveLinks) {
					const resolvedLinks = await this.plugin.resolveLinksForPath(
						filePath,
						[]
					);
					Object.assign(
						payload.user.additional_context,
						resolvedLinks
					);
				}

				// Resolve backlinks if enabled
				if (this.settings.interactivePanel.resolveBacklinks) {
					const resolvedBacklinks =
						await this.plugin.resolveBacklinksForPath(filePath, []);
					Object.assign(
						payload.user.additional_context,
						resolvedBacklinks
					);
				}
			}
		}

		// Extract and expand URLs from the prompt text itself if enabled
		if (this.settings.interactivePanel.expandUrls) {
			const promptUrls = extractLinksFromContent(promptValue);
			for (const url of promptUrls) {
				const content = await fetchUrlContent(url);
				if (content) {
					payload.user.additional_context[url] = content;
				}
			}
		}

		this.setLoading(true);
		const notice = new Notice(`Running Interactive flow ...`, 0);
		animateNotice(notice);

		try {
			const responseText = await this.plugin.caApiFetch(payload);
			this.setLoading(false);
			notice.hide();
			clearTimeout(noticeTimeout);
			this.renderResponse(responseText);
			this.copyButton.show();
		} catch (error) {
			this.setLoading(false);
			notice.hide();
			console.error("Failed to fetch response from Cloud Atlas:", error);
			new Notice(
				"Failed to send payload to Cloud Atlas. Check the console for more details."
			);
		}
	}

	private renderResponse(responseText: string) {
		this.responseCode.setText(responseText);
	}

	async onClose() {
		// Nothing to clean up.
	}
}
