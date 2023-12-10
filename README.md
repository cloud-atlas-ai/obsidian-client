# Obsidian Cloud Atlas Plugin

This is a plugin for [Obsidian](https://obsidian.md) to execute Cloud Atlas flows.

## What is [Cloud Atlas](https://www.cloud-atlas.ai/)?

Cloud Atlas provides intelligent and contextual assistance. It's a blend of a locally installed plugins and a server component that work collaboratively to give you access to a true second brain. The plugin is open source but Cloud Atlas is a paid service.

By tapping into knowledge sources and computational models, Cloud Atlas offers a unique way to interact with information. It connects with external systems like weather services, maps, the Wolfram Knowledge base, Wikipedia, IMDB, and computational models like Wolfram Alpha and OpenAI ChatGPT. This allows Cloud Atlas to provide rich, context-aware insights and responses based on your context.

The Obsidian plugin aspect of Cloud Atlas is open source, while the server component operates on a freemium model, ensuring accessibility and advanced features for all users.

## Planning Not Plans framework support

Cloud Atlas use cases are focused on implementing the [Planning not Plans framework](https://muness.com/posts/planning-not-plans/) for productivity. The framework is based on the idea that the process of planning is more important than the plan itself.

Cloud Atlas helps you implement this framework by providing a way to automatically process your notes and get contextual responses. The plugin ships with curated flows that are designed to help you implement the framework.

## What is a Flow?

A flow in Cloud Atlas is a powerful tool that simplifies and elevates your note-taking experience. It leverages content already in your vault you to:

1. **Automatically Process Notes**: Transform the content of your current note into enriched information or actionable insights without manual intervention.
2. **Get Contextual Responses**: Receive responses tailored to your specific queries or topics mentioned in your notes, making your notes more informative and useful.
3. **Streamline Information Gathering**: Easily compile and summarize key points from your notes, providing quick access to important information and helping you stay organized.
4. **Customize Your Note Processing**: Personalize how your notes are processed and what kind of output you receive, making your note-taking process more aligned with your individual needs and workflows.

Each flow is like having a personal assistant within Obsidian, helping you manage, analyze, and enhance your notes efficiently. We achieve this through a combination of an Obsidian plugin and a server component that makes use of systems that have knowledge (Weather services, Maps, Wolfram Knowledge base, Wikipedia, IMDB, etc...) and computational models (Wolfram Alpha, OpenAI ChatGPT, etc...).

## Understanding the Plugin's Functionality

- **Instructions and Prompt**: `<flow name>.prompt` files from the `vault>/CloudAtlas` subdirectory. The value of the `system_instruction` property acts as the instructions or context for the API, and the content of the file provides a specific prompt or question.
- **Additional Context**: The plugin will include all the notes listed in the `additional_context` property. It will also include forward and backlinks from the note you execute the flow in.
- **API Interaction**: The content of the active note, along with the system instructions, user prompt, and additional context, is sent to an external API. The API enriches and otherwise processes this and returns a response.
- **Appending API Response**: The response from the API is then automatically appended to the end of the active note, providing insights, answers, or content based on the provided instructions and the serverside processing.

## Usage

### Overview

This plugin enhances Obsidian by allowing you to define and execute custom flows. Each flow is a set of instructions and prompts that help you as you use Obsidian. The plugin achieves this by sending the current note's content (and additional context) to an external API and then appending the API's response to the note.

### Adding a Flow

1. **Create a Subdirectory**: In your Obsidian `<vault>`, navigate to the `CloudAtlas` directory. Each subdirectory within `CloudAtlas` represents a different flow. Create a new subdirectory for your new flow. The name of this subdirectory will be used as the name of the flow.

2. **Add Required Files**: In your new subdirectory, create two markdown files:
   - `system.md`: This file should contain any system-level instructions or information that you want to send to the API along with your note content.
   - `user_prompt.md`: This file should contain the prompt or question that you want to address in your note. This prompt will guide the API's response.

3. Reload Obsidian to see your new flow.

### Running a Flow

Once you add the flow, you can run it on any note in your vault. To run a flow, open the note you want to process and select the flow from the prompts. The command will send the note's content, along with the system instructions and user prompt, to the API. The API will return a response, which will be appended to the end of the note.

### Editing a Flow

To edit an existing flow or create a new one, navigate to the `CloudAtlas` subdirectory in your vault. There you can create a flow by creating a new file, e.g. `demo.flow.md`:

```markdown
---
system_instructions: You are a helpful assistant.
resolveBacklinks: true
resolveForwardLinks: true
exclusionPattern: ["^Private/", ".*-confidential.*"]
---

Say hello to the user.
```

The front matter of the file defines the flow settings.

- The `system_instructions` property defines the system instructions, telling Cloud Atlas what kind of personal assistant you want to be.
- The `resolveBacklinks` and `resolveForwardLinks` properties define whether backlinks and forward links will be resolved. Resolving links means that the content of the linked notes will be available to Cloud Atlas when it processes the note.
- The `exclusionPattern` property defines a regex of files to not resolve. You might want to exclude files that contain sensitive information or templates.
- The `mode` property will be used to define the mode of the flow. The types we are developing are `append`, `replace`, and `interactive`.

You can further configure a flow. For example, if you want to customize the demo flow, you can create a `demo.md` file in the `CloudAtlas` subdirectory:

- This file will be included in the additional context sent to the API.
- The content in it will also be resolved for backlinks and forward links as with the note.
- The front matter of the file can be used to override the flow settings defined in the `demo.md` file.

e.g. `demo.md`:

```markdown
---
system_instructions: You are a helpful assistant.
resolveBacklinks: false
resolveForwardLinks: false
---

My name is Muness. I am the user.
```

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
