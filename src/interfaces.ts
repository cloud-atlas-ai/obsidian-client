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
	system_instructions: string;
	mode: string;
	// Add other flow properties as needed
}
