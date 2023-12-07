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
