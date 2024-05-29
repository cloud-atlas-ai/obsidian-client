import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import CloudAtlasPlugin  from "./main";

import { Payload } from "./interfaces";
import ShortUniqueId from "short-unique-id";

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
    const promptTextbox = document.createElement('textarea');
    promptTextbox.placeholder = 'Enter your prompt here...';
    promptTextbox.classList.add('ca-interactive-prompt-textbox');
    this.containerEl.appendChild(promptTextbox);
    return promptTextbox;
  }

  createAttachedFilesList() {
    const attachedFilesList = this.containerEl.createDiv({ cls: 'attached-notes-list' });
    const listHeader = attachedFilesList.createEl('h4', { text: 'Attached Notes' });
    listHeader.style.marginBottom = '1em';
    const filesList = attachedFilesList.createEl('ul');
    filesList.style.height = '200px'; // Set a fixed height
    filesList.style.overflowY = 'auto'; // Make it scrollable
    return filesList;
  }

  // Function to update the attached files list
  updateAttachedFilesList(filesList: HTMLElement) {
    filesList.empty();
    if (this.attachedFiles.size === 0) {
      filesList.createEl('li', { text: 'No notes attached.' });
    } else {
      this.attachedFiles.forEach(file => {
        const listItem = filesList.createEl('li', { text: file });
        const removeButton = listItem.createEl('button', {
          text: 'Remove',
          cls: 'remove-button',
        });
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
    container.createEl('h4', { text: 'Cloud Atlas Interactive Mode' });

    // User prompt text box
    const prompt = this.createUserPromptTextbox();
    container.appendChild(prompt);

    // Attach button
    const attachButton = container.createEl('button', {
      cls: 'ca-attach-note-button',
      text: '+',
    });

    container.createDiv();

    // Send button
    const sendButton = container.createEl('button', {
      cls: 'send-button',
      text: 'Send to LLM',
    });

    // Attached files list
    const attachedFilesList = this.createAttachedFilesList();
    this.updateAttachedFilesList(attachedFilesList);

    // Copy to Clipboard button and Response header positioning
    const responseHeader = container.createEl('h4', { text: 'Response' });
    this.copyButton = container.createEl('button', { text: 'Copy to Clipboard', cls: 'ca-a-interactive-copy-button' });
    this.copyButton.hide();
    responseHeader.insertAdjacentElement('afterend', this.copyButton);

    // Listener for the Copy to Clipboard button
    this.copyButton.onClickEvent(() => {
      if (this.responseCode) {
        navigator.clipboard.writeText(this.responseCode.innerText).then(() => {
          new Notice('Response copied to clipboard.');
        }, (err) => {
          console.error('Could not copy text: ', err);
          new Notice('Failed to copy response to clipboard.');
        });
      }
    });

    // Response container
    this.responseContainer = container.createDiv({ cls: 'response-container' });
    this.responsePre = this.responseContainer.createEl('pre', { cls: 'ca-scrollable-response' });
    this.responseCode = this.responsePre.createEl('code');
    this.responseCode.addClass('ca-response-code');

    // Loading indicator
    this.loadingIndicator = container.createDiv({ cls: 'loading-indicator' });
    setIcon(this.loadingIndicator, 'sync');
    this.loadingIndicator.setText(' Waiting for response');
    this.setLoading(false); // Initially hidden

    // Event listeners
    sendButton.onClickEvent(async () => {
      if (prompt.value.trim() === "") {
        new Notice("Please enter a prompt before sending.");
        return;
      }
      await this.handleSendClick(prompt.value);
    });

    attachButton.onClickEvent(() => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        this.attachedFiles.add(activeFile.path);
        new Notice(`Attached file: ${activeFile.path}`);
        this.updateAttachedFilesList(attachedFilesList);
      } else {
        new Notice("No file is currently open.");
      }
    });
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
      provider: this.settings.useOpenAi ? "openai" : "azureai",
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
    for (const filePath of this.attachedFiles) {
      const fileContent = await this.plugin.readAndFilterContent(filePath, []);
      if (fileContent !== null) {
        payload.user.additional_context[filePath] = fileContent;
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
      new Notice("Failed to send payload to Cloud Atlas. Check the console for more details.");
    }
  }

  private renderResponse(responseText: string) {
      this.responseCode.setText(responseText);
  }


  async onClose() {
    // Nothing to clean up.
  }
}
