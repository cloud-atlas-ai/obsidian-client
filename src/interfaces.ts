export interface Payload {
	user: User;
	system: string;
}

export interface User {
	user_prompt: string;
	input: string;
	additional_context: { [key: string]: string };
}
