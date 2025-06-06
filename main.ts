import {
	type App,
	type Editor,
	type MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

// with dayjs main.js is 48K vs with luxon it's 780K !
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

function forwardTimeByMinutes(curTime: dayjs.Dayjs, minutes = 5): dayjs.Dayjs {
	// add 5 minutes, then round down to the nearest 5 minutes
	// (e.g. 09:25 becomes 09:30, 09:28 becomes 09:30, 09:32 becomes 09:35)
	const newMinute = 5 * Math.floor((curTime.minute() + minutes) / 5.0);
	const newTime = curTime.minute(newMinute); // this will also take care of going to the next hour if needed
	return newTime;
}

function backwardTimeByMinutes(curTime: dayjs.Dayjs, minutes = 5): dayjs.Dayjs {
	// add 5 minutes, then round down to the nearest 5 minutes
	// (e.g. 09:25 becomes 09:30, 09:28 becomes 09:30, 09:32 becomes 09:35)
	const newMinute = 5 * Math.ceil((curTime.minute() - minutes) / 5.0);
	const newTime = curTime.minute(newMinute); // this will also take care of going to the next hour if needed
	return newTime;
}

function modifyTimeUnderCursor(
	editor: Editor,
	modTimeFunc: (time: dayjs.Dayjs) => dayjs.Dayjs
) {
	// regex should capture timestamp like " 09:25 ", "-09:25 " or "-09:25>"
	// negative lookbehind (?<!:) ensures there is not a : immediately before
	// negative lookahead (?!:) ensures there is not a : immediately after.
	const regex = /(?<!:)(\d{2}:\d{2})(?!:)/g;
	const cursor = editor.getCursor();
	// match all timestamps on current line, find one with my cursor on it
	const line = editor.getLine(cursor.line);
	const matches = line.matchAll(regex);
	//console.log(...matches);
	for (const match of matches) {
		console.log(match);
		if (
			match.index &&
			cursor.ch >= match.index &&
			cursor.ch <= match.index + match[0].length
		) {
			// match[0] is the full match, e.g. " 09:25 "
			// match[1] is the capture group timestamp, e.g. "09:25"
			const curTime = dayjs(match[1], "HH:mm");

			const newTime = modTimeFunc(curTime);
			const newTimeStr = newTime.format("HH:mm");
			const newCh = match.index + match[0].indexOf(match[1]);
			editor.replaceRange(
				newTimeStr,
				{
					line: cursor.line,
					ch: newCh,
				},
				{ line: cursor.line, ch: newCh + newTimeStr.length }
			);
			// put cursor back where user started
			// (when you overwrite, cursor is reset to start of overwrite)
			editor.setCursor(cursor);
			break;
		}
	}
}

function insertTextAndMoveCursor(editor: Editor, text: string) {
	const cursor = editor.getCursor();
	editor.replaceRange(text, cursor);
	editor.setCursor(
		editor.offsetToPos(editor.posToOffset(cursor) + text.length)
	);
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		this.addCommand({
			id: "insert-timestamp",
			name: "Insert timestamp without day link",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// generate a timestamp in the format <2025-06-01 Sat 09:58>
				// https://moment.github.io/luxon/#/formatting?id=table-of-tokens
				// const timestamp = DateTime.now().toFormat(
				// 	"<yyyy-MM-dd EEE HH:mm>"
				// );
				const timestamp = dayjs().format("<YYYY-MM-DD ddd HH:mm>");
				insertTextAndMoveCursor(editor, timestamp);
			},
		});
		this.addCommand({
			id: "insert-timestamp-linked",
			name: "Insert timestamp with day link",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// - generate a timestamp in the format <[[2025-06-01]] Sat 09:58> so it links to the day in question
				// - dayjs uses [this is escaped] to escape stuff in format string, so I need to escape the opening
				//   square brackets with more brackets
				const timestamp = dayjs().format(
					"<[[][[]YYYY-MM-DD]] ddd HH:mm>"
				);
				insertTextAndMoveCursor(editor, timestamp);
			},
		});
		this.addCommand({
			id: "timestamp-forward-5min",
			name: "Forward timestamp by 5 minutes",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				modifyTimeUnderCursor(editor, (curTime) => {
					return forwardTimeByMinutes(curTime, 5);
				});
			},
		});
		this.addCommand({
			id: "timestamp-back-5min",
			name: "Backward timestamp by 5 minutes",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				modifyTimeUnderCursor(editor, (curTime) => {
					return backwardTimeByMinutes(curTime, 5);
				});
			},
		});
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerMarkdownPostProcessor((el, ctx) => {
			// https://orgmode.org/manual/Timestamps.html
			// Regex to match <2025-06-01 Sat 09:58> or &lt;2025-06-01 Sat 09:58&gt;
			// ALSO: linked date with a href `<<a data-href="2025-06-02" href="2025-06-02" class="internal-link" target="_blank" rel="noopener nofollow">2025-06-02</a> Mon 10:00-10:35>`
			// or the bare date string `<2025-06-02 Mon 10:00-10:35>`
			// ALSO: <HH:mm> time-only timestamps; this deviates from the org-mode standard but I use it in my daily notes
			// `(?:...` is a non-capturing group, so it won't be included in the match result.
			const regex =
				/(?:<|&lt;)(?:(<a [^>]+>)?(\d{4}-\d{2}-\d{2})(<\/a>)? (\w{3}) )?(\d{2}:\d{2}(?:-\d{2}:\d{2})?)(?:>|&gt;)/g;

			for (const node of el.findAll(
				"span, p, li, h1, h2, h3, h4, h5, h6"
			)) {
				// in this case, the regex strictly limits to timestamps, so we can safely use innerHTML
				const newHTML = node.innerHTML.replace(
					regex,
					(_match, aopen, date, aclose, day, time) => {
						// Wrap timestamp, drop the < or &lt; and > or &gt;
						return `<span class="org-timestamp">${aopen ?? ""}${
							date ?? ""
						}${aclose ?? ""} ${
							day ?? ""
						} <span class="org-timestamp-time">${time}</span></span>`;
					}
				);
				// only set the new innerHTML if it has actually changed to avoid unnecessary rerendering
				if (newHTML !== node.innerHTML) {
					node.innerHTML = newHTML;
				}
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
