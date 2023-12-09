export interface Payload {
	user: User;
	system: string;
	options: Options;
}

export interface Options {
	entity_recognition?: boolean;
	generate_embeddings?: boolean;
	wikify?: string[];
}
export interface AdditionalContext {
	[key: string]: string;
}

export interface User {
	user_prompt: string;
	input: string;
	additional_context: AdditionalContext;
}

export enum NamedEntity {
	Person = "Person",
	Location = "Location",
	Organization = "Organization",
}
