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
	};
}

function joinStrings(
	first: string | undefined,
	second: string | undefined
): string {
	return [first, second].filter((s) => s).join("\n");
}
