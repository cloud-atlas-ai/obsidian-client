import WordExtractor from "word-extractor";
import { AdditionalContext, Payload, User } from "./interfaces";
import {
	App,
	LinkCache,
	MetadataCache,
	Notice,
	TAbstractFile,
	TFile,
  normalizePath,
} from "obsidian";
import { CustomArrayDict } from "obsidian-typings";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./constants";
const PATH_SEPARATOR = '/';

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

export async function getImageContent(
	basePath: string,
	path: string
): Promise<string> {
  try {
	const contents = await this.app.vault.readBinary(normalizePath([basePath, path].join(PATH_SEPARATOR)));
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
  } catch (e) {
    console.debug('Error reading image file', normalizePath([basePath, path].join(PATH_SEPARATOR)), e);
    return '';
  }
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
  try {
	const extractor = new WordExtractor();
	const extracted = await extractor.extract(normalizePath([basePath, path].join(PATH_SEPARATOR)));
	return extracted.getBody();
  }
  catch (e) {
    console.debug('Error reading word file', normalizePath([basePath, path].join(PATH_SEPARATOR)), e);
    return null;
  }
}

export async function getFileContents(basePath: string, path: string): Promise<string | null> {
	try {
    const contents = await this.app.vault.read(normalizePath([basePath, path].join(PATH_SEPARATOR)));
		return new TextDecoder("utf8", { fatal: true }).decode(contents);
	} catch (e) {
		console.debug('Error reading file', normalizePath([basePath, path].join(PATH_SEPARATOR)), e);
		return null;
	}
}

export function cyrb53(str: string, seed = 0): string {
	let h1 = 0xdeadbeef ^ seed,
		h2 = 0x41c6ce57 ^ seed;
	for (let i = 0, ch; i < str.length; i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

	return decToHex(4294967296 * (2097151 & h2) + (h1 >>> 0));
}

function decToHex(dec: number) {
	return (dec + Math.pow(16, 6)).toString(16);
}

export async function insertPayload(
	apiKey: string,
	flow: string,
	payload: Payload
) {
	return await fetch(`https://${SUPABASE_URL}/rest/v1/apikeys_flows`, {
		headers: {
			apikey: SUPABASE_ANON_KEY,
			Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
			"Content-Type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify({
			api_key: apiKey,
			flow,
			payload
		}),
		method: "POST",
	});
}
