*<p xmlns:cc="http://creativecommons.org/ns#" >This work is licensed under <a href="http://creativecommons.org/licenses/by-nc-nd/4.0/?ref=chooser-v1" target="_blank" rel="license noopener noreferrer" style="display:inline-block;">CC BY-NC-ND 4.0<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/cc.svg?ref=chooser-v1"><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/by.svg?ref=chooser-v1"><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/nc.svg?ref=chooser-v1"><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/nd.svg?ref=chooser-v1"></a></p>*

# Obsidian Cloud Atlas Plugin

This plugin integrates Obsidian with Cloud Atlas, enriching your note-taking experience by automatically processing notes, providing contextual responses, and streamlining information gathering with the power of various computational models and external systems.

## Cloud Atlas Features

- **Canvas Flows**: Use the interactive canvas to set up and run flows with components like input, context, and user prompts.
  - Name these as `<flow name>.flow.canvas`
  - Execute them using the command palette or the Cloud Atlas view.

- **Markdown Notes Mode**: Run flows directly on Markdown files with support for context selection or using the current file as context.
  - Define flows in `CloudAtlas/<flow name>.flow.md`
  - Optionally, include additional data with `CloudAtlas/<flow name>.flowdata.md`

### LLM options

You can use the plugin with Cloud Atlas as the Language Model (LLM) provider or bring your own OpenAI key.

- No need for a separate ChatGPT account; choose between OpenAI ChatGPT-4 or AzureAI ChatGPT-4.
- Cloud Atlas supports vision tasks and entity recognition to enhance notes with wikilinks automatically.
- Server-side embeddings generation for adding relevant context to your requests.

## Cloud Atlas Subscription

Due to high demand, we are limiting signups for Cloud Atlas as an LLM provider. If you wish to sign up, please email us at `signmeup@cloud-atlas.ai` with a brief description of your intended use and a confirmation of your willingness to pay for the service if it proves valuable.

## Using Your Own OpenAI Key

You can choose to use your own OpenAI key with the plugin. However, be aware that this mode comes with the following limitations:

- Entity recognition and automatic will not be available.
- Vision tasks are unsupported.
- Server-side embeddings to improve context relevance are not included.

## What is a Flow?

A flow in Cloud Atlas is a powerful tool that simplifies and elevates your note-taking experience. It leverages content already in your vault you to:

1. **Automatically Process Notes**: Transform the content of your current note into enriched information or actionable insights without manual intervention.
2. **Get Contextual Responses**: Receive responses tailored to your specific queries or topics mentioned in your notes, making your notes more informative and useful.
3. **Streamline Information Gathering**: Easily compile and summarize key points from your notes, providing quick access to important information and helping you stay organized.
4. **Customize Your Note Processing**: Personalize how your notes are processed and what kind of output you receive, making your note-taking process more aligned with your individual needs and workflows.

Each flow is like having a personal assistant within Obsidian, helping you manage, analyze, and enhance your notes efficiently. We achieve this through a combination of an Obsidian plugin and a server component that makes use of systems that have knowledge (Weather services, Maps, Wolfram Knowledge base, Wikipedia, IMDB, etc...) and computational models (Wolfram Alpha, OpenAI ChatGPT, etc...).

## Understanding the Plugin's Functionality

- **Instructions and Prompt**: `<flow name>.flow.md` files from the `vault>/CloudAtlas` subdirectory. The value of the `system_instruction` property acts as the instructions or context for the API, and the content of the file provides a specific prompt or question.
- **API Interaction**: The content of the active note, along with the system instructions, user prompt, and additional context, is sent to an external API. The API enriches and otherwise processes this and returns a response.
- **Appending API Response**: The response from the API is then automatically appended to the end of the active note, providing insights, answers, or content based on the provided instructions and the serverside processing.

---

## Cloud Atlas Plugin Usage Guide

We believe that good context is key to leveraging LLMs effectively. We offer multiple modes for using Cloud Atlas in Obsidian:

- **Canvas Flow Mode**: Use the interactive canvas to set up and run flows with components like input, context, and user prompts.
- **Markdown Notes Mode**: Run flows directly on Markdown files with support for context selection or using the current file as context.
- **Interactive Panel Mode**: Send a prompt along with selected context.

This  will walk you through creating, running, and customizing your personal flows. Let's get started.

## Canvas Flow Mode

The Canvas Flow mode in the Cloud Atlas plugin enhances your Obsidian experience by enabling a visual representation of your workflows. By creating a Canvas in Obsidian, you can structurally map out your notes, ideas, and tasks, and leverage Cloud Atlas's AI capabilities to interact with them more intuitively.

### Features

- **Visual Workflow Mapping**: Easily map out your workflow in a visual canvas and define how each part of your notes interacts with each other.
- **AI-Powered Processing**: Cloud Atlas AI analyzes your canvas flow, providing insights, summaries, or any other AI-powered feature directly within your canvas.
- **Seamless Integration**: The Canvas Flow mode works hand-in-hand with other Cloud Atlas features, ensuring a smooth and efficient workflow within Obsidian.

### How to Use Canvas Flow Mode

1. Create a new `.flow` canvas.
2. Add nodes to your canvas, which can be of different types such as Card, Note from Vault, and Media from Vault.
3. Assign colors to your nodes to indicate their types:
   - Red: Input
   - Orange: User Prompt
   - Blue: System
   - Green: Context
4. Use the `Run Canvas Flow` command to execute the flow, which will pass data between nodes and utilize the Cloud Atlas AI to process and generate content.

### Example Usage

You can create a Canvas Flow to summarize a meeting by:

1. Adding a Note to your canvas with the meeting transcript. Color it Red to indicate it as an input.
2. Adding a Card colored Blue for the System Instructions, telling the LLM to act as a summarizer.
3. Adding a Card colored Orange for the User Prompt, asking the LLM to summarize the meeting.
4. Running the Canvas Flow to get a summarized version of the meeting right within your Obsidian canvas.

We often use Canvas Flows as a Pair Programmer or Assistant while preparing for a presentation based on notes.

## Markdown Notes Mode

### Step 1: Creating a New Flow

1. **Create a New Flow**: Use the command palette (`Ctrl/Cmd + P`) and type `Create New Flow`. This will create a new `.flow` file in the `CloudAtlas` directory.

2. **Name Your Flow**: Follow the naming convention `CloudAtlas/<flow name>.flow.md` for markdown notes mode.

3. **Setup Your Flow**: Populate your new flow file with the desired content, context, and instructions as needed.

    ```markdown
    ---
    system_instructions: You are a helpful assistant.
    resolveBacklinks: true
    resolveForwardLinks: true
    exclusionPattern: ["^Private/", ".*-confidential.*"]
    ---

    Say hello to the user.
    ```

    In the front matter (the section between `---`), you can set various options:
    - `system_instructions`: Instructions for Cloud Atlas on how to assist.
    - `resolveBacklinks` and `resolveForwardLinks`: Whether to include content from linked notes.
    - `exclusionPattern`: Patterns for notes to exclude, useful for omitting sensitive data.

4. **Running Flows**:

### Step 2: Running Your Flow

1. **Open Any Note**: With your flow created, open any note in your vault where you want to run the flow.
2. **Execute the Flow**:
   1. **From the Command Palette:** After creating or updating a flow, you can register it as a command. Go to the Settings and register it as a command. This will allow you to run the flow from the command palette.
   2. **From the Cloud Atlas view:** You can also run flows from the Cloud Atlas view by clicking on the Play button next to the flow name.
3. **View the Results**: Cloud Atlas processes the note and appends or replaces the content based on your flow settings. The response from Cloud Atlas will appear in your note.

### Step 3: Customizing Your Flow

1. **Create a Customization File**: In the `CloudAtlas` directory, create a `demo.flowdata` file to customize the `demo` flow.
2. **Add Custom Content and Settings**: Here's an example customization:

    ```markdown
    ---
    resolveBacklinks: false
    resolveForwardLinks: false
    ---

    My name is Muness. I am the user.
    ```

    This file allows you to:
    - Provide additional content that Cloud Atlas will consider when processing your flow.
    - Override settings defined in `demo.flow`.

3. **Re-run Your Flow**: After customizing, go back to any note and run the `demo` flow again. You'll see how the customizations impact the flow's output.

That's it! You've now learned how to create, run, and customize your own flows in Obsidian using the Cloud Atlas plugin. Go wild!

### Example Usage

We often use Markdown Notes Mode to prepare for a day:

1. Create a flow named `Morning Routine` that includes a list of tasks to complete.
2. Customize the flow with a `Morning Routine.flowdata` file that includes additional context about current goals and strengths.
3. Run the flow on your daily notes (which has your calendar and tasks) to get a pep talk.

We also use it to:

- review a day after it's done, summarizing the day's events and achievements.
- summarize progress at the end of a week.

### Alpha Features

There are some alpha features we are working on, the most exciting of which is to develop a flow and turn it into a Chrome Extension. This will allow you to run flows on any webpage you visit, making it easier to get information and context from the web. Let us know if you'd like to be a part of the alpha testing.

## Interactive Panel Mode

The Interactive Panel mode is a dedicated panel within Obsidian that allows you to interact with Cloud Atlas in real-time. It enables you to send prompts to Cloud Atlas and receive responses directly within Obsidian.

### How to Use

1. Open the Interactive Panel by clicking on the Cloud Atlas panel icon in the Obsidian ribbon. This will display the Cloud Atlas Interactive Mode panel.
2. Enter your prompt in the provided textbox. This could be any question or command you wish to send to Cloud Atlas.
3. Optionally, you can attach notes from your vault to provide additional context to Cloud Atlas. Click the '+' button to attach the currently active note.
4. Once you're ready, click the 'Send to LLM' button to submit your prompt to Cloud Atlas.
5. The panel will display a loading indicator while waiting for a response.
6. Once Cloud Atlas processes your prompt, the response will be displayed in the panel.
7. You can copy the response to your clipboard using the 'Copy to Clipboard' button, which appears after a response is received.

### Example Usage

We often use the Interactive Panel Mode to have a Q&A about the contents of a specific note.

## Manually installing the plugin

### With [Obsidian BRAT](https://github.com/TfTHacker/obsidian42-brat)

1. Install the BRAT plugin
    1. Open `Settings` -> `Community Plugins`
    2. Disable safe mode, if enabled
    3. *Browse*, and search for "BRAT"
    4. Install the latest version of **Obsidian42 - BRAT**
2. Open BRAT settings (`Settings` -> `BRAT`)
    1. Scroll to the `Beta Plugin List` section
    2. `Add Beta Plugin`
    3. Specify this repository: `cloud-atlas-ai/obsidian-client`
3. Enable the `Cloud Atlas` plugin (`Settings` -> `Community Plugins`)
4. Set the API key in the plugin settings. You can get an API key by signing up at the [Cloud Atlas website](https://www.cloud-atlas.ai/).
