export interface Payload {
	user: User;
	system?: string;
	options?: Options;
}

export interface Options {
	generate_embeddings?: boolean;
	entity_recognition?: boolean;
    wikify?: string[];
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

export enum NamedEntity {
    Person = "Person",
    Location = "Location",
    Organization = "Organization",
    // List of supported entities -> https://learn.microsoft.com/en-us/azure/ai-services/language-service/named-entity-recognition/concepts/ga-preview-mapping 
    // Add an entry here, and in the settings builder to add new category support
}
