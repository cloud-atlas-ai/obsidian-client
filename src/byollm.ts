import { OpenAI } from "openai";
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import { LlmOptions, Payload } from "./interfaces";

export interface RequestMsg {
	role: "user" | "system";
	content: string;
}

function payloadToMessages(payload: Payload): RequestMsg[] {
	const messages = [];
	if (payload.system) {
		const system_msg: RequestMsg = {
			role: "system",
			content: payload.system || "",
		};
		messages.push(system_msg);
	}
	if (payload.user?.user_prompt) {
		const user_prompt_msg: RequestMsg = {
			role: "user",
			content: payload.user?.user_prompt || "",
		};
		messages.push(user_prompt_msg);
	}

	const input_msg: RequestMsg = {
		role: "user",
		content: payload.user?.input || "",
	};

	messages.push(input_msg);

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

	const response = await client.getChatCompletions(deploymentId, messages, llmOptions);

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
