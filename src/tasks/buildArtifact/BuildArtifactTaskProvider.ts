// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { languageServerApiManager } from "../../languageServerApi/languageServerApiManager";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { ExportJarStep, ExportJarMessages, stepMap, resetStepMetadata } from "./BuildTaskHelperUtility";
import { window, workspace } from "coc.nvim";

let isExportingJar: boolean = false;

export async function executeExportJarTask(): Promise<void> {
    await saveWorkspaceFiles();

    if (!(await languageServerApiManager.ready()) || isExportingJar) {
        return;
    }
    isExportingJar = true;
    const stepMetadata: IStepMetadata = {
        taskLabel: "default",
        steps: [],
        projectList: [],
        elements: [],
        classpaths: []
    };
    try {
        const resolveJavaProjectExecutor: IExportJarStepExecutor | undefined = stepMap.get(ExportJarStep.ResolveJavaProject);
        if (!resolveJavaProjectExecutor) {
            throw new Error(
                ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.FINDEXECUTOR, ExportJarStep.ResolveJavaProject)
            );
        }
        await resolveJavaProjectExecutor.execute(stepMetadata);
        await runExportJarStepChain(stepMetadata);
        isExportingJar = false;
    } catch (err) {
        window.showErrorMessage("Exporting jar failed or canceled");
        isExportingJar = false;
        return;
    }
}

export async function runExportJarStepChain(stepMetadata: IStepMetadata): Promise<boolean> {
    let step: ExportJarStep = ExportJarStep.ResolveJavaProject;
    let previousStep: ExportJarStep | undefined;
    let executor: IExportJarStepExecutor | undefined;
    while (step !== ExportJarStep.Finish) {
        executor = stepMap.get(step);
        if (!executor) {
            throw new Error(ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.FINDEXECUTOR, step));
        }
        if (!(await executor.execute(stepMetadata))) {
            // Go back
            previousStep = stepMetadata.steps.pop();
            if (!previousStep) {
                throw new Error(ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.GOBACK, step));
            }
            resetStepMetadata(previousStep, stepMetadata);
            step = previousStep;
        } else {
            // Go ahead
            switch (step) {
                case ExportJarStep.ResolveJavaProject:
                    step = ExportJarStep.ResolveMainClass;
                    break;
                case ExportJarStep.ResolveMainClass:
                    step = ExportJarStep.GenerateJar;
                    break;
                case ExportJarStep.GenerateJar:
                    step = ExportJarStep.Finish;
                    break;
                default:
                    throw new Error(ExportJarMessages.stepErrorMessage(ExportJarMessages.StepAction.GOAHEAD, step));
            }
        }
        if (step === ExportJarStep.ResolveJavaProject) {
            return false;
        }
    }
    isExportingJar = false;
    return true;
}

export async function saveWorkspaceFiles() {
    const folders = workspace.workspaceFolders ?? [];
    const folderUris = folders.map((f) => f.uri);
    for (const doc of workspace.textDocuments) {
        // Only save modified files in workspace, not new/untitled or out-of-workspace files
        if (folderUris.some((uri) => doc.uri.startsWith(uri)) && doc.uri.startsWith("file://")) {
            // TODO: fix this
            // Use the nvim command `:write` for this buffer (number)
            // await workspace.nvim.call("bufnr", [doc.uri]); // make sure buffer really exists
            // await workspace.nvim.command(`silent! keepjumps keepalt noautocmd write ${doc.bufnr}`);
        }
    }
}
