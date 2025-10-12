// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { window, workspace } from "coc.nvim";
import { Jdtls } from "../../java/jdtls";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { ExportJarMessages, ExportJarStep } from "./BuildTaskHelperUtility";

export class ResolveJavaProjectExecutor implements IExportJarStepExecutor {
    public async execute(stepMetadata: IStepMetadata): Promise<boolean> {
        if (stepMetadata.workspaceFolder === undefined) {
            await this.resolveJavaProject(stepMetadata);
        }
        return true;
    }

    private async resolveJavaProject(stepMetadata: IStepMetadata): Promise<void> {
        const folders = Array.isArray(workspace.workspaceFolders) ? workspace.workspaceFolders : [];
        if (stepMetadata.entry && typeof stepMetadata.entry.uri === "string") {
            const match = folders.find((f) => f.uri === stepMetadata.entry.uri);
            if (match) {
                stepMetadata.workspaceFolder = match;
                stepMetadata.projectList = await Jdtls.getProjects(match.uri);
                return;
            }
        }
        if (folders.length === 1) {
            stepMetadata.workspaceFolder = folders[0];
            stepMetadata.projectList = await Jdtls.getProjects(folders[0].uri);
            return;
        }
        if (folders.length > 1) {
            const items = folders.map((f) => ({ label: f.name || f.uri, description: f.uri }));
            const picked = await window.showQuickPick(items, {
                title: "Select workspace folder",
                canPickMany: false,
                matchOnDescription: true
            });
            if (picked && picked.label) {
                const match = folders.find((f) => (f.name || f.uri) === picked.label);
                if (match) {
                    stepMetadata.workspaceFolder = match;
                    stepMetadata.projectList = await Jdtls.getProjects(match.uri);
                    stepMetadata.steps.push(ExportJarStep.ResolveJavaProject);
                    return;
                }
            }
            throw new Error("No workspace was selected");
        }
        throw new Error(ExportJarMessages.JAVAWORKSPACES_EMPTY);
    }
}
