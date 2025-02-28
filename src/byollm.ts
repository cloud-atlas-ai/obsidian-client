import { OpenAI } from "openai";
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import { LlmOptions, Payload } from "./interfaces";

export interface RequestMsg {
	role: "user" | "system";
	content: string;
}

function payloadToMessages(payload: Payload): RequestMsg[] {
	const messages = [];
	for (const p of payload.messages) {
		if (p.system) {
			const system_msg: RequestMsg = {
				role: "system",
				content: p.system || "",
			};
			messages.push(system_msg);
		}
		if (p.user?.user_prompt) {
			const user_prompt_msg: RequestMsg = {
				role: "user",
				content: p.user?.user_prompt || "",
			};
			messages.push(user_prompt_msg);
		}

		if (p.user?.additional_context) {
			for (const [key, value] of Object.entries(
				p.user?.additional_context
			)) {
				const additional_context_msg: RequestMsg = {
					role: "user",
					content: `additional_context -${key}: ${value}\n`,
				};
				messages.push(additional_context_msg);
			}
		}

		const input_msg: RequestMsg = {
			role: "user",
			content: p.user?.input || "",
		};

		messages.push(input_msg);
	}

	return messages;
}

export async function azureAiFetch(
	apiKey: string,
	deploymentId: string,
	endpoint: string,
	payload: Payload,
	llmOptions: LlmOptions
): Promise<string | null | undefined> {
	const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

	const messages = payloadToMessages(payload);

	const response = await client.getChatCompletions(
		deploymentId,
		messages,
		llmOptions
	);

	return response.choices[0].message?.content;
}

export async function openAiFetch(
	apiKey: string,
	modelId: string,
	payload: Payload,
	llmOptions: LlmOptions
): Promise<string | null> {
	const client = new OpenAI({
		apiKey: apiKey,
		dangerouslyAllowBrowser: true,
	});

	const messages = payloadToMessages(payload);

	const response = await client.chat.completions.create({
		model: modelId,
		messages: messages,
		...llmOptions,
	});

	return response.choices[0].message.content;
}
