import {readFileSync} from "fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const failures = [];

if (packageJson.version !== manifest.version) {
    failures.push(
        `manifest.json version ${manifest.version} does not match package version ${packageJson.version}.`
    );
}
if (versions[packageJson.version] !== manifest.minAppVersion) {
    failures.push(
        `versions.json must map ${packageJson.version} to ${manifest.minAppVersion}.`
    );
}

if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
}

console.log(`Version ${packageJson.version} is synchronized.`);
