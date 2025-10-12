// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Disposable, ExtensionContext, QuickPickItem, Uri, window, workspace } from "coc.nvim";
import * as fse from "fs-extra";
import * as _ from "lodash";
import { platform } from "os";
import { Commands } from "../commands";
import { Jdtls } from "../java/jdtls";
import { Settings } from "../settings";
import { Utility } from "../utility";
import minimatch = require("minimatch");
import { normalize } from "path";

const isMac = platform() === "darwin";

export class LibraryController implements Disposable {
    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand(Commands.JAVA_PROJECT_ADD_LIBRARIES, () => this.addLibraries(false)),
            commands.registerCommand(Commands.JAVA_PROJECT_ADD_LIBRARY_FOLDERS, () => this.addLibraries(true)),
            commands.registerCommand(Commands.JAVA_PROJECT_REMOVE_LIBRARY, () => this.removeLibrary()),
            commands.registerCommand(Commands.JAVA_PROJECT_REFRESH_LIBRARIES, () => this.refreshLibraries())
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    private async choosePathsPrompt(prompt: string): Promise<Uri[] | undefined> {
        const input = await window.requestInput(prompt + " (multiple paths are comma separated): ");
        if (!input) return;
        const parts = input
            .split(",")
            .map((s) => s.trim())
            .map((s) => normalize(s))
            .filter(Boolean);
        if (parts.length === 0) return;
        return parts.map((p) => Uri.parse(p));
    }

    private async confirmAndPick(list: Uri[], title: string): Promise<boolean> {
        await window.showQuickPick(
            list.map((u) => u.fsPath),
            { placeholder: title }
        );
        const item = await window.showQuickPick(
            [
                { idx: 0, label: "Proceed" },
                { idx: 1, label: "Cancel" }
            ],
            { placeholder: "Confirm selection" }
        );
        if (!item || item == undefined || item.idx === 1) {
            void window.showWarningMessage("Canceled adding library resources");
            return false;
        }
        void window.showInformationMessage("Confirming new library resources");
        return true;
    }

    public async addLibraries(canSelectFolders?: boolean): Promise<void> {
        const prompt = canSelectFolders ? "Enter folder path or glob patterns" : "Enter complete jar resource paths";
        const uris: Uri[] = await this.choosePathsPrompt(prompt);

        if (!uris || uris.length === 0) return;

        if (!(await this.confirmAndPick(uris, "Add referenced libraries"))) {
            return;
        }
        addLibraryGlobs(
            await Promise.all(
                uris.map(async (uri: Uri) => {
                    // keep the param: `includeWorkspaceFolder` to false here
                    // since the multi-root is not supported well for invisible projects
                    const uriPath = workspace.asRelativePath(uri, false);
                    const isLibraryFolder = canSelectFolders || (isMac && (await fse.stat(uri.fsPath)).isDirectory());
                    return isLibraryFolder ? uriPath + "/**/*.jar" : uriPath;
                })
            )
        );
    }

    public async removeLibrary() {
        const setting = Settings.referencedLibraries();
        const include: string[] = setting.include ?? [];
        const exclude: string[] = setting.exclude ?? [];
        const all: string[] = _.uniq([...include, ...exclude]);

        if (all.length === 0) {
            void window.showWarningMessage("No referenced library patterns found.");
            return;
        }

        type Item = QuickPickItem & { key: string };
        const items: Item[] = all.map((p) => ({
            description: exclude.includes(p) ? "Excluded" : "Included",
            picked: exclude.includes(p), // preselect the excluded ones
            label: p,
            key: p
        }));

        const picks = await window.showQuickPick(items, {
            title: "Select libraries to exclude",
            canPickMany: true,
            matchOnDescription: true
        });

        if (!picks) {
            return;
        }

        const nextExclude = _.uniq(picks.map((p) => p.key)).sort();
        const nextInclude = _.uniq(all.filter((p: string) => !nextExclude.includes(p))).sort();

        Settings.updateReferencedLibraries({
            ...setting,
            include: nextInclude,
            exclude: nextExclude
            // keep sources unchanged
        });

        window.showInformationMessage(`Updating referenced libraries`);
        Settings.updateReferencedLibraries(setting);
    }

    public async refreshLibraries(): Promise<void> {
        const workspaceFolder = Utility.getDefaultWorkspaceFolder();
        if (workspaceFolder && workspaceFolder.uri !== undefined) {
            window.showInformationMessage(`Refreshing ${workspaceFolder.uri} libraries`);
            await Jdtls.refreshLibraries(workspaceFolder.uri);
        } else {
            window.showErrorMessage(`Unable to resolve current workspace folder`);
        }
    }
}

export function addLibraryGlobs(libraryGlobs: string[]) {
    const setting = Settings.referencedLibraries();
    setting.exclude = dedupAlreadyCoveredPattern(libraryGlobs, ...setting.exclude);
    setting.include = updatePatternArray(setting.include, ...libraryGlobs);
    void window.showInformationMessage(JSON.stringify(libraryGlobs));
    Settings.updateReferencedLibraries(setting);
}

/**
 * Check if the `update` patterns are already covered by `origin` patterns and return those uncovered
 */
function dedupAlreadyCoveredPattern(origin: string[], ...update: string[]): string[] {
    return update.filter((newPattern) => {
        return !origin.some((originPattern) => {
            return minimatch(newPattern, originPattern);
        });
    });
}

function updatePatternArray(origin: string[], ...update: string[]): string[] {
    update = dedupAlreadyCoveredPattern(origin, ...update);

    const result = [];
    result.push(...origin);
    result.push(...update);
    return _.uniq(result);
}
