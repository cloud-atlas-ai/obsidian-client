import { readFileSync } from "fs";
import WordExtractor from "word-extractor";
import { AdditionalContext, Payload, User } from "./interfaces";

export function combinePayloads(
	base: Payload | null,
	override: Payload | null
): Payload {
	if (!base) {
		if (!override) {
			throw new Error("No base or override payload");
		}
		return override;
	}

	if (!override) {
		return base;
	}
	const additional_context: AdditionalContext = {};
	Object.assign(additional_context, base.user.additional_context);
	Object.assign(additional_context, override.user.additional_context);

	const input = joinStrings(base.user.input, override.user.input);
	const user_prompt = joinStrings(
		base.user.user_prompt,
		override.user.user_prompt
	);

	const user: User = {
		user_prompt,
		input,
		additional_context,
	};

	return {
		user,
		system: override.system || base.system,
		options: override.options || base.options,
		provider: override.provider || base.provider,
		llmOptions: override.llmOptions || base.llmOptions,
	};
}

export function joinStrings(
	first: string | null | undefined,
	second: string | null | undefined
): string {
	return [first, second].filter((s) => s).join("\n");
}

export async function getImageContent(basePath: string, path: string) {
	const contents = readFileSync(`${basePath}/${path}`);
	const buffedInput = Buffer.from(contents).toString("base64");

	// use the file extension to determine the mime type
	// can we use a case statement here?
	if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
		return `data:image/jpeg;base64,${buffedInput}`;
	} else if (path.endsWith(".gif")) {
		return `data:image/gif;base64,${buffedInput}`;
	}

	// default to png
	return `data:image/png;base64,${buffedInput}`;
}

export function isImage(path: string): boolean {
	return (
		path.endsWith(".png") ||
		path.endsWith(".jpg") ||
		path.endsWith(".jpeg") ||
		path.endsWith(".gif")
	);
}

export function isWord(path: string): boolean {
	return path.endsWith(".docx") || path.endsWith(".doc");
}

export function isMarkdown(path: string): boolean {
	return path.endsWith(".md");
}

export function isOtherText(path: string): boolean {
	return !(isImage(path) && !isMarkdown(path));
}

export async function getWordContents(
	basePath: string,
	path: string
): Promise<string | undefined> {
	const extractor = new WordExtractor();
	const extracted = await extractor.extract(`${basePath}/${path}`);
	return extracted.getBody();
}

export function getFileContents(
	basePath: string,
	path: string
): string | undefined {
	const contents = readFileSync(`${basePath}/${path}`);
	try {
		return new TextDecoder("utf8", { fatal: true }).decode(contents);
	} catch (e) {
		console.debug(e);
		return;
	}
}
