import WordExtractor from "word-extractor";
import { AdditionalContext, Payload, User } from "./interfaces";
import {
	App,
	LinkCache,
	MetadataCache,
	Notice,
	TAbstractFile,
	TFile,
} from "obsidian";
import { CustomArrayDict } from "obsidian-typings";

// Utility function to safely get a TFile by path
export function getFileByPath(filePath: string, app: App): TFile {
	const file: TAbstractFile | null =
		app.vault.getAbstractFileByPath(filePath);
	if (file instanceof TFile) {
		return file;
	} else {
		throw new Error(`The path ${filePath} does not refer to a valid file.`);
	}
}

interface ExtendedMetadataCache extends MetadataCache {
	getBacklinksForFile(file: TFile): CustomArrayDict<LinkCache>;
}

export async function getBacklinksForFile(
	file: TFile,
	app: App
): Promise<CustomArrayDict<LinkCache>> {
	try {
		return await (
			app.metadataCache as ExtendedMetadataCache
		).getBacklinksForFile(file);
	} catch (error) {
		new Notice(
			"Backlink resolution failed. Consider installing the Backlink Cache Plugin."
		);
		return {} as CustomArrayDict<LinkCache>;
	}
}

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
		requestId: override.requestId || base.requestId,
	};
}

export function joinStrings(
	first: string | null | undefined,
	second: string | null | undefined
): string {
	return [first, second].filter((s) => s).join("\n");
}

export function isImage(path: string): boolean {
	return (
		path.endsWith(".png") ||
		path.endsWith(".jpg") ||
		path.endsWith(".jpeg") ||
		path.endsWith(".gif")
	);
}

export function isFlow(path: string): boolean {
	return path.endsWith(".flowrun.md");
}

export function isCanvasFlow(path: string): boolean {
	return path.endsWith(".flow.canvas");
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
): Promise<string | null> {
	const extractor = new WordExtractor();
	const extracted = await extractor.extract(`${basePath}/${path}`);
	return extracted.getBody();
}
