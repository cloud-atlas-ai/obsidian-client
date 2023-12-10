export interface Payload {
	user: User;
	system: string;
}

export interface AdditionalContext {
	[key: string]: string;
}

export interface User {
	user_prompt: string;
	input: string;
	additional_context: AdditionalContext;
}

export interface FlowConfig {
	userPrompt: string;
	system_instructions: string | null;
	mode: string | null;
	resolveBacklinks: boolean | null;
	resolveForwardLinks: boolean | null;
	exclusionPatterns: string[];
	frontMatterOffset: number;
	// Add other flow properties as needed
}
