import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import CloudAtlasPlugin from "./main";

import CodeMirror from "codemirror";
import { Payload } from "./interfaces";
import ShortUniqueId from "short-unique-id";

export const INTERACTIVE_PANEL_TYPE = "interactive-panel";

export class InteractivePanel extends ItemView {
  plugin: CloudAtlasPlugin;
  attachedFiles: Set<string>;
  settings: import("./settings").CloudAtlasPluginSettings;

  constructor(leaf: WorkspaceLeaf, plugin: CloudAtlasPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.settings = this.plugin.settings;
    this.attachedFiles = new Set(); // Initialize the Set
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
    const promptTextbox = document.createElement('input');
    promptTextbox.type = 'text';
    promptTextbox.placeholder = 'Enter your prompt here...';
    promptTextbox.classList.add('prompt-textbox');
    this.containerEl.appendChild(promptTextbox);
    return promptTextbox;
  }

  updateAttachedFilesList() {
    const attachedFilesList = this.containerEl.children[1].querySelector('.attached-files-list');

    if (attachedFilesList !== null) {
      attachedFilesList.empty();
      attachedFilesList.createEl('h4', { text: 'Attached Files' });
      if (this.attachedFiles.size === 0) {
        attachedFilesList.createEl('p', { text: 'No files attached.' });
      } else {
        for (const file of this.attachedFiles) {
          attachedFilesList.createEl('li', { text: file });
          // Add a button to remove the file from the attachedFiles set
          const removeButton = attachedFilesList.createEl('button', {
            text: 'Remove',
            cls: 'remove-button',
          });
          removeButton.addEventListener('click', () => {
            this.attachedFiles.delete(file);
            this.updateAttachedFilesList();
          });
        }
      }
    }
  }


  async onOpen() {
    const container = this.containerEl.children[1];

    container.empty();
    container.createEl("h4", { text: "Cloud Atlas Interactive mode" });

    // User prompt text box
    const prompt = this.createUserPromptTextbox();
    container.appendChild(prompt);

    // Action button to send
    const sendButton = container.createEl('button', {
      cls: 'send-button',
      text: 'Send',
    });

    container.createEl('br');

    // Attach button to refer to other notes or file system
    const attachButton = container.createEl('button', {
      cls: 'attach-button',
      text: 'Attach',
    });

    //display a list of attached files
    container.createEl('br');
    const attachedFilesList = container.createEl('div', {
      cls: 'attached-files-list',
    });
    attachedFilesList.createEl('h4', { text: 'Attached Files' });
    this.updateAttachedFilesList();

    attachButton.addEventListener('click', () => {
      // Grab the handle to the currently open file, add it to the attachedFiles set
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        this.attachedFiles.add(activeFile.path);
        new Notice(`Attached file: ${activeFile.path}`);
        //update the list of attached files
        this.updateAttachedFilesList();
      } else {
        new Notice("No file is currently open.");
      }
    });

    // Update the sendButton event listener in the onOpen method
    sendButton.addEventListener('click', async () => {
      if (prompt.value.trim() === "") {
        new Notice("Please enter a prompt before sending.");
        return;
      }
      await this.handleSendClick(prompt.value);
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

    // Send the payload to the Cloud Atlas API
    try {
      const responseText = await this.plugin.caApiFetch(payload);
      this.renderResponse(responseText);
      console.log("Received response from Cloud Atlas:", responseText);
    } catch (error) {
      console.error("Failed to fetch response from Cloud Atlas:", error);
      new Notice("Failed to send payload to Cloud Atlas. Check the console for more details.");
    }
  }

  private renderResponse(responseText: string) {
    const responseContainer = this.containerEl.querySelector('.response-container');
    if (responseContainer) {
      responseContainer.empty();
      responseContainer.createEl('p', { text: responseText });
    }
  }


  async onClose() {
    // Nothing to clean up.
  }
}
