export interface Payload {
	user: User;
	system?: string;
	options?: Options;
}

export interface Options {
	generate_embeddings?: boolean;
	entity_recognition?: boolean;
}

export interface AdditionalContext {
	[key: string]: string;
}

export interface User {
	user_prompt?: string;
	input: string;
	additional_context?: AdditionalContext;
}

export interface FlowConfig {
	userPrompt?: string;
	system_instructions?: string;
	mode?: string;
	resolveBacklinks?: boolean;
	resolveForwardLinks?: boolean;
	exclusionPatterns: string[];
	frontMatterOffset: number;
	// Add other flow properties as needed
}
