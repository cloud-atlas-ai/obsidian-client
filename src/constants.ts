import { CanvasContent } from "./canvas";
import { CloudAtlasPluginSettings } from "./settings";

export const NOTE_PLACEHOLDER =
	"\n\n---\n\n" + `\u{1F4C4}\u{2194}\u{1F916}` + "\n\n---\n\n";

export const SUPABASE_ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZWd3aG55Y2Z2Y2Jsb3VjbWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTc4MTkzMTIsImV4cCI6MjAxMzM5NTMxMn0.q2GoWOzLHecS8wS8GlpFTxN6kzcIE-Xx4KS7Jkr7-30";
export const SUPABASE_URL = "auegwhnycfvcbloucmhv.supabase.co";

export const ADDITIONAL_SYSTEM =
	"Use the content in 'input' as the main context, consider the 'additional_context' map for related information, and respond based on the instructions in 'user_prompt'. Assist the user by synthesizing information from these elements into coherent and useful insights or actions.";

export const PLACEHOLDER = `\u{1F4C4}\u{2194}\u{1F916}`;

export const DEFAULT_SETTINGS: CloudAtlasPluginSettings = {
	apiKey: "",
	advancedOptions: false,
	previewMode: false,
	entityRecognition: false,
	generateEmbeddings: false,
	wikify: [],
	canvasResolveLinks: false,
	canvasResolveBacklinks: false,
	useOpenAi: false,
	useVertexAi: false,
	developmentMode: false,
	llmOptions: {
		temperature: 0.8,
		max_tokens: 2000,
	},
	timeoutMins: 5,
	openAiSettings: {
		apiKey: "",
		modelId: "",
	},
	azureAiSettings: {
		apiKey: "",
		deploymentId: "",
		endpoint: "",
	},
	provider: "openai",
	registeredFlows: [],
	autoProcessing: {
		enabled: false,
		defaultFlow: "example"
	},
	interactivePanel: {
		resolveLinks: false,
		resolveBacklinks: false,
		expandUrls: false
	}
};

export const exampleFlowString = `---
system_instructions: You are a helpful assistant.
resolveBacklinks: true
resolveForwardLinks: true
expandUrls: true
exclusionPattern: ["^Private/", ".*-confidential.*"]
can_delegate: false
---

Say hello to the user.
`;

export const CANVAS_CONTENT: CanvasContent = {
	nodes: [
		{
			id: "9ca0dce906eb2b17",
			type: "file",
			file: "CloudAtlas/example/user.md",
			x: -80,
			y: -220,
			width: 340,
			height: 120,
			color: "1",
		},
		{
			id: "bdda4ed7429cf432",
			x: -391,
			y: -201,
			width: 222,
			height: 82,
			color: "2",
			type: "file",
			file: "CloudAtlas/example/user_prompt.md",
		},
		{
			id: "5641ca8bb2160e07",
			type: "file",
			file: "CloudAtlas/example/additional context.md",
			x: -55,
			y: -460,
			width: 290,
			height: 100,
			color: "4",
		},
		{
			id: "9faa2aea9699bf3f",
			x: -53,
			y: 20,
			width: 288,
			height: 147,
			color: "5",
			type: "file",
			file: "CloudAtlas/example/system.md",
		},
	],
	edges: [
		{
			id: "89a5ba1776cd58a5",
			fromNode: "5641ca8bb2160e07",
			fromSide: "bottom",
			toNode: "9ca0dce906eb2b17",
			toSide: "top",
		},
		{
			id: "4864dab35edffc85",
			fromNode: "9faa2aea9699bf3f",
			fromSide: "top",
			toNode: "9ca0dce906eb2b17",
			toSide: "bottom",
		},
		{
			id: "6a6497073b3e0475",
			fromNode: "bdda4ed7429cf432",
			fromSide: "right",
			toNode: "9ca0dce906eb2b17",
			toSide: "left",
		},
	],
};
