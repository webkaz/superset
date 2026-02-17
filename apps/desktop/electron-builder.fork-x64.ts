import baseConfig from "./electron-builder";
import type { Configuration } from "electron-builder";

const repo = process.env.GITHUB_REPOSITORY || "webkaz/superset";
const [owner, name] = repo.split("/");

const config: Configuration = {
	...baseConfig,
	publish: {
		provider: "github",
		owner: owner || "webkaz",
		repo: name || "superset",
	},
	mac: {
		...baseConfig.mac,
		target: [
			{
				target: "default",
				arch: ["x64"],
			},
		],
		// Fork builds are unsigned by default; keep distribution local/manual.
		notarize: false,
		hardenedRuntime: false,
	},
};

export default config;
