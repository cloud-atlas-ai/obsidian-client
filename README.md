# Obsidian Cloud Atlas Plugin

This is a plugin for [Obsidian](https://obsidian.md) to execute Cloud Atlas flows.

## What is [Cloud Atlas](https://www.cloud-atlas.ai/)?

Cloud Atlas provides intelligent and contextual assistance. It's a blend of a locally installed plugins and a server component that work collaboratively to give you access to a true second brain. The plugin is open source but Cloud Atlas is a paid service.

By tapping into knowledge sources and computational models, Cloud Atlas offers a unique way to interact with information. It connects with external systems like weather services, maps, the Wolfram Knowledge base, Wikipedia, IMDB, and computational models like Wolfram Alpha and OpenAI ChatGPT. This allows Cloud Atlas to provide rich, context-aware insights and responses based on your context.

The Obsidian plugin aspect of Cloud Atlas is open source, while the server component operates on a freemium model, ensuring accessibility and advanced features for all users.

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

This  will walk you through creating, running, and customizing your personal flows. Let's get started.

### Step 1: Creating a New Flow

1. **Navigate to the `CloudAtlas` Directory**: Open your Obsidian vault and find the `CloudAtlas` subdirectory. This is where your custom flows will live.

2. **Create a New Flow File**: In the `CloudAtlas` directory, create a new file for your flow. Name it something like `demo.flow`.

3. **Add Flow Content and Settings**: Edit your new flow file. Here's an example of what it might look like:

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

### Step 2: Running Your Flow

1. **Open Any Note**: With your flow created, open any note in your vault where you want to run the flow.

2. **Execute the Flow**: Use Obsidian's command palette (`Ctrl/Cmd + P`) and type `Run demo Flow`. Selecting this command will execute your flow on the current note.

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

## Manually installing the plugin

1. If you don't already use plugins
     - [Enable](https://help.obsidian.md/Extending+Obsidian/Community+plugins#Install+a+community+plugin) community plugins.
     - Create a new folder in your Obsidian vault plugin folder (`mkdir <vault>/.obsidian/plugins/`).
2. Download the latest release from the [releases](https://github.com/cloud-atlas-ai/obsidian-client/releases) page.
3. Unzip it and copy the directory to your vault `<vault>/.obsidian/plugins/cloud-atlas`.
4. Reload Obsidian.
5. Enable the plugin.
6. Set the API key in the plugin settings. You can get an API key by signing up at the [Cloud Atlas website](https://www.cloud-atlas.ai/).

## Development

1. To develop Obsidian plugins you need NodeJS and npm installed. Do that first.
2. Checkout this codebase.
3. `npm install`
4. Make the changes you want...
5. `npm run dev` will watch for changes and build the plugin to `dist/main.js`.
6. Create a new folder in your Obsidian vault plugin folder (`mkdir <vault>/.obsidian/plugins/cloud-atlas/`).
7. Copy `manifest.json` to your Obdisian vault plugin folder (`cp manifest.json <vault>/.obsidian/plugins/cloud-atlas/`).
8. Copy `dist.main/js` (or `dist/main-debug.js` if you made a debug build) to your Obdisian vault plugin folder (`cp dist/main.js <vault>/.obsidian/plugins/cloud-atlas/main.js`).
9. Enable Cloud Atlas in Obsidian.
10. Reload the vault or use the [Hot Reload Plugin](https://github.com/pjeby/hot-reload).
