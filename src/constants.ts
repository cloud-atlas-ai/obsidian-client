import { CloudAtlasPluginSettings } from "./settings";

export const ADDITIONAL_SYSTEM =
	"Use the content in 'input' as the main context, consider the 'additional_context' map for related information, and respond based on the instructions in 'user_prompt'. Assist the user by synthesizing information from these elements into coherent and useful insights or actions.";

export const DEFAULT_SETTINGS: CloudAtlasPluginSettings = {
	apiKey: "",
	previewMode: false,
	entityRecognition: false,
	generateEmbeddings: false,
	wikify: [],
	canvasResolveLinks: false,
	canvasResolveBacklinks: false,
};

export const exampleFlowString = `---
system_instructions: You are a helpful assistant.
resolveBacklinks: true
resolveForwardLinks: true
exclusionPattern: ["^Private/", ".*-confidential.*"]
---

Say hello to the user.
`;
