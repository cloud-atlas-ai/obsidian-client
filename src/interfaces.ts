export interface LlmOptions {
	temperature?: number;
	max_tokens?: number;
}

export interface FlowResponse {
	response: string;
	config: FlowConfig;
	payload: Payload;
}

export interface Payload {
	messages: CaRequestMsg[];
	options: Options;
	provider: "auto" | "openai" | "vertexai" | string;
	model: string | null;
	llmOptions: LlmOptions;
	requestId: string;
	// V1 is the legacy sync version
	// V2 is the async version through Supabase
	// If not set, defaults to V1 serverside
	version?: "V1" | "V2";
}

export interface CaRequestMsg {
	user: User | null
	system: string | null
	assistant: string | null
}

export interface Options {
	generate_embeddings: boolean;
	entity_recognition: boolean;
	wikify: string[];
}

export interface AdditionalContext {
	[key: string]: string;
}

export interface User {
	user_prompt: string | null;
	input: string | null;
	additional_context?: AdditionalContext;
}

export interface FlowConfig {
	userPrompt: string | null;
	system_instructions: string | null;
	mode: string | null;
	resolveBacklinks: boolean;
	resolveForwardLinks: boolean;
	expandUrls: boolean;
	exclusionPatterns: string[];
	frontMatterOffset: number;
	llmOptions: LlmOptions;
	additional_context: AdditionalContext;
	model: string | null;
	can_delegate: boolean;
}

export enum NamedEntity {
	Person = "Person",
	Location = "Location",
	Organization = "Organization",
	// List of supported entities -> https://learn.microsoft.com/en-us/azure/ai-services/language-service/named-entity-recognition/concepts/ga-preview-mapping
	// Add an entry here, and in the settings builder to add new category support
}

export interface PayloadConfig {
	payload: Payload;
	config: FlowConfig;
}

export interface ResponseRow {
	response: string;
}

export interface OpenAiSettings {
	apiKey: string;
	modelId: string;
}

export interface AzureAiSettings {
	apiKey: string;
	deploymentId: string;
	endpoint: string;
}

export interface AutoProcessingConfig {
	enabled: boolean;
	flow: string;
	outputNameTemplate: string; // e.g., "${basename}-processed"
	expandUrls?: boolean;
	model?: string | null;
}

export interface CloudAtlasPluginSettings {
	apiKey: string;
	advancedOptions: boolean;
	useOpenAi: boolean;
	useVertexAi: boolean;
	previewMode: boolean;
	entityRecognition: boolean;
	generateEmbeddings: boolean;
	wikify: string[];
	canvasResolveLinks: boolean;
	canvasResolveBacklinks: boolean;
	developmentMode: boolean;
	llmOptions: LlmOptions;
	timeoutMins: number;
	openAiSettings: OpenAiSettings;
	azureAiSettings: AzureAiSettings;
	provider: string;
	registeredFlows: string[];
	createNewFile: boolean; // Whether to create a new file for flow responses instead of modifying the current file
	outputFileTemplate: string; // Template for naming output files
	autoProcessing: {
		enabled: boolean;
		defaultFlow: string;
	};
	interactivePanel: {
		resolveLinks: boolean;
		resolveBacklinks: boolean;
		expandUrls: boolean;
	};
}
