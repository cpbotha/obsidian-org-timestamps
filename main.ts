import {
	type App,
	type Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerMarkdownPostProcessor((el, ctx) => {
			// Regex to match <2025-06-01 Sat 09:58> or &lt;2025-06-01 Sat 09:58&gt;
			// `(?:...` is a non-capturing group, so it won't be included in the match result.
			const regex =
				/(?:<|&lt;)(\d{4}-\d{2}-\d{2} \w{3}) (\d{2}:\d{2})(?:>|&gt;)/g;

			for (const node of Array.from(
				el.querySelectorAll("span, p, li, h1, h2, h3, h4, h5, h6")
			)) {
				node.innerHTML = node.innerHTML.replace(
					regex,
					(_match, date, time) => {
						// Wrap timestamp, drop the < or &lt; and > or &gt;
						return `<span class="org-timestamp">${date} <span class="org-timestamp-time">${time}</span></span>`;
					}
				);
			}
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
