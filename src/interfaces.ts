export interface LlmOptions {
	temperature?: number;
	max_tokens?: number;
}

export interface Payload {
	user: User;
	system: string | null;
	options: Options;
	provider: "azureai" | "openai";
	llmOptions: LlmOptions;
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
	exclusionPatterns: string[];
	frontMatterOffset: number;
	llmOptions: LlmOptions;
	// Add other flow properties as needed
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
