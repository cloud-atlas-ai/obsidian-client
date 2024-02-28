import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import CloudAtlasPlugin from "./main";

export const CA_VIEW_TYPE = "flow-view";

export class FlowView extends ItemView {
	plugin: CloudAtlasPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: CloudAtlasPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return CA_VIEW_TYPE;
	}

	getDisplayText() {
		return "Cloud Atlas flows view";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h4", { text: "Cloud Atlas flows" });
		const vaultFiles = this.app.vault.getMarkdownFiles();

		console.debug(`Found ${vaultFiles.length} vault files`);

		const cloudAtlasFlows = vaultFiles.filter(
			(file) =>
				file.path.startsWith("CloudAtlas/") &&
				file.path.endsWith(".flow.md")
		);

		console.debug(`Found ${cloudAtlasFlows.length} CloudAtlas flows`);

		const ul = container.createEl("ul");
		// Create commands for each flow
		cloudAtlasFlows.sort().forEach((flowFile) => {
			const flow = flowFile.path.split("/")[1].split(".flow.md")[0];
			const table = ul.createEl("table");
			table.addClass("cloud-atlas-flow-table");
			const tr = table.createEl("tr");
			const td1 = tr.createEl("td");
			td1.addClass("cloud-atlas-flow-td-half");
			td1.createEl("span", { text: flow });
			const td2 = tr.createEl("td");
			const runBtn = td2.createEl("button", { text: "Run" });
			setIcon(runBtn, "play");
			runBtn.addClass("cloud-atlas-flow-btn-primary");
			runBtn.addEventListener("click", async () => {
				// console.debug(`Running flow ${flow}`);
				await this.plugin.runFlow(null, flow);
			});
		});
	}

	async onClose() {
		// Nothing to clean up.
	}
}
